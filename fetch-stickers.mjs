#!/usr/bin/env node
// Downloads the archive's animated (lottie) stickers into stickers/.
//
// They cannot be loaded from Discord's CDN at render time: unlike images, the
// sticker JSON is served without an access-control-allow-origin header, so the
// browser blocks lottie's cross-origin fetch. Hosting the files alongside the
// site is the only way to render them, and there are only ~136 of them.
//
//   node fetch-stickers.mjs            # download anything missing
//   node fetch-stickers.mjs --force    # re-download everything

import fs from 'node:fs';
import path from 'node:path';

const FORCE = process.argv.includes('--force');
const OUT = 'stickers';
const DELAY_MS = 150;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Scan the day HTML for lottie sticker ids.
const ids = new Set();
const dayFiles = fs.readdirSync('days').filter((f) => f.endsWith('.html')).sort();
process.stderr.write(`scanning ${dayFiles.length} day files...\n`);
for (const f of dayFiles) {
    const html = fs.readFileSync(path.join('days', f), 'utf8');
    for (const m of html.matchAll(/stickers\/(\d+)\.json/g)) ids.add(m[1]);
}
process.stderr.write(`${ids.size} unique lottie stickers referenced\n\n`);

fs.mkdirSync(OUT, { recursive: true });

let fetched = 0, skipped = 0, failed = 0, bytes = 0;
for (const id of ids) {
    const dest = path.join(OUT, `${id}.json`);
    if (!FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        skipped++;
        continue;
    }
    try {
        const res = await fetch(`https://cdn.discordapp.com/stickers/${id}.json`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; archive-sticker-fetch/1.0)' },
            signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) {
            process.stderr.write(`  ${res.status} ${id}\n`);
            failed++;
        } else {
            const body = Buffer.from(await res.arrayBuffer());
            // Guard against saving an error page as if it were animation data.
            try {
                JSON.parse(body.toString('utf8'));
            } catch {
                process.stderr.write(`  not json: ${id}\n`);
                failed++;
                await sleep(DELAY_MS);
                continue;
            }
            fs.writeFileSync(dest, body);
            bytes += body.length;
            fetched++;
        }
    } catch (err) {
        process.stderr.write(`  ${err.name}: ${id}\n`);
        failed++;
    }
    await sleep(DELAY_MS);
}

const total = fs.readdirSync(OUT).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
process.stderr.write(`\nfetched ${fetched}, skipped ${skipped}, failed ${failed}\n`);
process.stderr.write(`${OUT}/ now holds ${fs.readdirSync(OUT).length} files, ${(total / 1024 / 1024).toFixed(1)} MB\n`);
