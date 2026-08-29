# Branch workflow

This project has two branches:

- **`main`** — The deployed static site. Contains only the files needed to run the website.
- **`dev`** — Everything in main, plus dev tooling (tests, build scripts, Vite, package.json).

## Making changes

1. Work on `dev`. Run tests with `npm test`.
2. Commit to `dev` and push.
3. Publish the site files to `main` **without checking it out** (see below), then push.

```bash
# After committing on dev. Run from the repo root, still on dev.
DEV_SRC=$(git ls-tree --name-only dev:src | sed 's|^|src/|')
FILES=".gitignore index.html script.js style.css chatlog.css Screenshot.png $DEV_SRC"

export GIT_INDEX_FILE=/tmp/mainidx; rm -f "$GIT_INDEX_FILE"
git read-tree main
for f in $FILES; do
  entry=$(git ls-tree dev -- "$f")
  git update-index --add --cacheinfo \
    "$(echo "$entry" | awk '{print $1}'),$(echo "$entry" | awk '{print $3}'),$f"
done

# delete: files main still carries that dev has dropped
for f in $(git ls-tree -r --name-only main -- src); do
  echo "$DEV_SRC" | grep -qx "$f" || git update-index --force-remove "$f"
done

TREE=$(git write-tree); unset GIT_INDEX_FILE

git update-ref refs/heads/main \
  "$(git commit-tree "$TREE" -p "$(git rev-parse main)" -m 'Same commit message')"

git diff --stat main dev -- $FILES src/   # must be empty
git push origin dev main
```

Add other changed site files to `FILES` as needed (`day-manifest.json`,
`search-data-*.json`, `days/`, `README.md`).

The deletion loop matters: `update-index --add` only ever adds, so a file
removed on `dev` otherwise lives on forever in `main`. That is how
`src/search.js` nearly stayed on the deployed site after being deleted. The
verification diff covers `src/` as a directory precisely so a leftover shows up.

### Why not `git checkout main`

Two reasons, both learned the hard way:

- **It moves about a gigabyte.** 1,099 files (509 MB of `days-search-indexes/`)
  plus the tooling exist only on `dev`, so switching to `main` deletes them from
  the working tree and switching back rewrites them. On the `/mnt/c` 9p mount
  that is slow enough to be worth avoiding entirely.
- **`git add -A` on `main` used to stage `token.env`.** `main` had no
  `.gitignore`, so the blanket add would have committed the Discord token and
  `node_modules/`. `.gitignore` now ships on `main` as well (it is inert for the
  deployed site), but prefer explicit paths over `-A` regardless.

The recipe above never checks out `main` and never stages anything implicitly,
so neither problem can occur.

## What goes where

| File | main | dev |
|------|------|-----|
| index.html, script.js, style.css, src/ | yes | yes |
| chatlog.css, day-manifest.json, days/ | yes | yes |
| search-data-*.json, search-data-meta.json | yes | yes |
| Screenshot.png, README.md | yes | yes |
| .gitignore | yes | yes |
| package.json, package-lock.json | no | yes |
| vite.config.js, CONTRIBUTING.md | no | yes |
| tests/, build-search*.js, extract-days.js | no | yes |
| audit-assets.mjs, days-search-indexes/ | no | yes |
| node_modules/, token.env | no | no (gitignored) |

## Repo-local git settings

This repo stores 3.7 GB of large text blobs, which makes git's default packing
behaviour dangerous here: an automatic `gc` once OOM-killed the whole WSL
session. These are set in `.git/config` and are worth restoring after a fresh
clone.

```bash
git config gc.auto 0                 # never repack automatically
git config core.bigFileThreshold 16m # do not delta-compress the big day files
git config pack.windowMemory 64m
git config pack.deltaCacheSize 64m
git config pack.threads 1
```

If loose objects pile up after discarded work, reclaim them explicitly rather
than letting `gc` do it:

```bash
git reflog expire --expire-unreachable=now --all
git prune --expire=now
```

## Rebuilding search indexes

If day HTML files change, regenerate the search data:

```bash
node build-search-indexes.js   # Generates per-day indexes in days-search-indexes/
node build-search.js            # Consolidates into search-data-*.json chunks
```

Or use `npm run build:search` to run both.

## Auditing asset links

The archive references Discord-hosted assets that rot at different rates.
`npm run audit:assets` samples the day HTML, classifies every asset URL, and
probes a bounded subset of each class. It is unauthenticated and rate-limit
aware.

```bash
node --no-warnings audit-assets.mjs --days=30 --per-class=60
node --no-warnings audit-assets.mjs --no-probe    # census only, no network
```

Dead links are repaired in the browser by `src/fallbacks.js`; the day files are
never rewritten.
