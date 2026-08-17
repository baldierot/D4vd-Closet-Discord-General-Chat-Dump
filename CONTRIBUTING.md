# Branch workflow

This project has two branches:

- **`main`** — The deployed static site. Contains only the files needed to run the website.
- **`dev`** — Everything in main, plus dev tooling (tests, build scripts, Vite, package.json, .gitignore).

## Making changes

1. Work on `dev`. Run tests with `npm test`.
2. Commit to `dev` and push.
3. Switch to `main`, copy site files from `dev`, commit with the same message, and push:

```bash
# After committing on dev:
git checkout main
git checkout dev -- index.html script.js style.css src/
# Include other changed site files as needed (e.g. search-data-*.json, days/, etc.)
git add -A
git commit -m "Same commit message"
git push origin main
```

## What goes where

| File | main | dev |
|------|------|-----|
| index.html, script.js, style.css, src/ | yes | yes |
| chatlog.css, day-manifest.json, days/ | yes | yes |
| search-data-*.json, search-data-meta.json | yes | yes |
| Screenshot.png, README.md | yes | yes |
| package.json, package-lock.json | no | yes |
| vite.config.js, .gitignore | no | yes |
| tests/, build-search*.js, extract-days.js | no | yes |
| days-search-indexes/ | no | yes |
| node_modules/ | no | no (gitignored) |

## Rebuilding search indexes

If day HTML files change, regenerate the search data:

```bash
node build-search-indexes.js   # Generates per-day indexes in days-search-indexes/
node build-search.js            # Consolidates into search-data-*.json chunks
```

Or use `npm run build:search` to run both.
