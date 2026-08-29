#!/usr/bin/env node
// Samples the day HTML, classifies every asset URL, and probes a bounded
// subset of each class to find out what still resolves.
//
// Read-only and unauthenticated - no Discord token is involved.
//
//   node audit-assets.mjs                      # 40 days, 120 probes per class
//   node audit-assets.mjs --days=100 --per-class=300
//   node audit-assets.mjs --no-probe           # census only, zero network
//
// Politeness: HEAD requests only, small concurrency, a delay between every
// request, and adaptive backoff that honours Retry-After. A class is dropped
// after repeated 429s rather than hammering through them.

import fs from 'node:fs';
import path from 'node:path';
import { extractUrls, classifyUrl, proxyOrigin, parseSignature, CLASSES } from './src/assets.js';

const argv = Object.fromEntries(
    process.argv.slice(2).map((a) => {
        const [k, v] = a.replace(/^--/, '').split('=');
        return [k, v === undefined ? true : v];
    })
);

const DAYS = Number(argv.days ?? 40);
const PER_CLASS = Number(argv['per-class'] ?? 120);
const CONCURRENCY = Number(argv.concurrency ?? 4);
const DELAY_MS = Number(argv.delay ?? 120);
const PROBE = !argv['no-probe'];
const OUT = String(argv.out ?? 'asset-audit.json');
const UA = 'Mozilla/5.0 (compatible; archive-link-audit/1.0)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sampleDays(n) {
    const all = fs.readdirSync('days').filter((f) => f.endsWith('.html')).sort();
    if (n >= all.length) return all;
    // Even spread across the whole archive rather than a contiguous block.
    const step = all.length / n;
    return Array.from({ length: n }, (_, i) => all[Math.floor(i * step)]);
}

function census(files) {
    const byClass = new Map(CLASSES.map((c) => [c, new Set()]));
    const users = new Set();
    const emojis = new Set();
    let total = 0;

    for (const f of files) {
        const html = fs.readFileSync(path.join('days', f), 'utf8');
        for (const url of extractUrls(html)) {
            total++;
            const cls = classifyUrl(url);
            byClass.get(cls).add(url);
            if (cls === 'avatar') {
                const m = url.match(/\/avatars\/(\d+)\//);
                if (m) users.add(m[1]);
            } else if (cls === 'emoji') {
                const m = url.match(/\/emojis\/(\d+)/);
                if (m) emojis.add(m[1]);
            }
        }
    }
    return { byClass, users, emojis, total };
}

// --- polite probing -------------------------------------------------------

let backoff = 0;          // extra ms added after a 429
let consecutive429 = 0;

async function probe(url) {
    for (let attempt = 0; attempt < 3; attempt++) {
        if (backoff) await sleep(backoff);
        let res;
        try {
            res = await fetch(url, {
                method: 'HEAD',
                redirect: 'follow',
                headers: { 'User-Agent': UA },
                signal: AbortSignal.timeout(20000),
            });
        } catch (err) {
            return { status: 0, error: err.name === 'TimeoutError' ? 'timeout' : 'network' };
        }

        if (res.status === 429) {
            consecutive429++;
            const retry = Number(res.headers.get('retry-after') ?? 0) * 1000;
            backoff = Math.max(backoff * 2 || 1000, retry, 1000);
            await sleep(backoff);
            continue;
        }

        consecutive429 = 0;
        backoff = Math.max(0, backoff - 200); // decay once things are healthy again
        return { status: res.status };
    }
    return { status: 429, error: 'rate-limited' };
}

async function probeAll(urls, label) {
    const results = [];
    let i = 0;
    let aborted = false;

    async function worker() {
        while (i < urls.length && !aborted) {
            const url = urls[i++];
            const r = await probe(url);
            results.push({ url, ...r });
            if (consecutive429 >= 5) {
                aborted = true;
                process.stderr.write(`  ! ${label}: repeated 429s, stopping this class early\n`);
            }
            await sleep(DELAY_MS);
        }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
    return results;
}

function pick(set, n) {
    const arr = [...set];
    if (arr.length <= n) return arr;
    const step = arr.length / n;
    return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
}

function summarise(results) {
    const codes = {};
    for (const r of results) {
        const key = r.error ? `${r.status} (${r.error})` : String(r.status);
        codes[key] = (codes[key] ?? 0) + 1;
    }
    const ok = results.filter((r) => r.status >= 200 && r.status < 300).length;
    return { probed: results.length, alive: ok, dead: results.length - ok, codes };
}

// --- main -----------------------------------------------------------------

const files = sampleDays(DAYS);
process.stderr.write(`Scanning ${files.length} day files (${files[0]} .. ${files[files.length - 1]})\n`);

const { byClass, users, emojis, total } = census(files);

process.stderr.write(`\n${total} URLs, ${[...byClass.values()].reduce((a, s) => a + s.size, 0)} unique\n`);
process.stderr.write(`${users.size} unique users, ${emojis.size} unique emojis in this sample\n\n`);

const report = {
    sampledDays: files.length,
    totalUrls: total,
    uniqueUsers: users.size,
    uniqueEmojis: emojis.size,
    classes: {},
};

// Signature expiry is answerable offline - no request needed.
{
    const signed = [...byClass.get('attachment'), ...byClass.get('mediaProxy')]
        .map(parseSignature)
        .filter(Boolean);
    if (signed.length) {
        const windows = signed.filter((s) => s.issuedAt).map((s) => (s.expiresAt - s.issuedAt) / 3600000);
        const expired = signed.filter((s) => s.expiresAt <= Date.now()).length;
        report.signatures = {
            count: signed.length,
            expired,
            medianWindowHours: windows.length ? windows.sort((a, b) => a - b)[Math.floor(windows.length / 2)] : null,
            latestExpiry: new Date(Math.max(...signed.map((s) => s.expiresAt))).toISOString(),
        };
    }
}

for (const cls of CLASSES) {
    const set = byClass.get(cls);
    report.classes[cls] = { unique: set.size };
    if (!PROBE || set.size === 0 || cls === 'other') continue;

    const sample = pick(set, PER_CLASS);
    process.stderr.write(`probing ${cls} (${sample.length} of ${set.size} unique)...\n`);
    const results = await probeAll(sample, cls);
    report.classes[cls].probe = summarise(results);
    report.classes[cls].deadExamples = results.filter((r) => r.status !== 200).slice(0, 3).map((r) => r.url);

    // For proxy links, also check whether the wrapped origin outlives the proxy.
    if (cls === 'externalProxy') {
        const origins = sample.map(proxyOrigin).filter(Boolean).slice(0, Math.min(40, PER_CLASS));
        process.stderr.write(`probing externalProxy origins (${origins.length})...\n`);
        report.classes[cls].originProbe = summarise(await probeAll(origins, 'origins'));
    }
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

// --- human summary --------------------------------------------------------

const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '-');
console.log('\n' + '='.repeat(64));
console.log(`ASSET AUDIT  -  ${files.length} days sampled, ${total} URLs`);
console.log('='.repeat(64));
console.log(String('CLASS').padEnd(16) + String('UNIQUE').padStart(9) + String('PROBED').padStart(9)
    + String('ALIVE').padStart(13) + '   CODES');
for (const cls of CLASSES) {
    const c = report.classes[cls];
    if (!c || c.unique === 0) continue;
    const p = c.probe;
    console.log(
        cls.padEnd(16)
        + String(c.unique).padStart(9)
        + String(p ? p.probed : '-').padStart(9)
        + String(p ? `${p.alive} (${pct(p.alive, p.probed)})` : '-').padStart(13)
        + '   ' + (p ? Object.entries(p.codes).map(([k, v]) => `${k}:${v}`).join(' ') : '')
    );
}
if (report.classes.externalProxy?.originProbe) {
    const o = report.classes.externalProxy.originProbe;
    console.log(`\nexternalProxy origins: ${o.alive}/${o.probed} alive (${pct(o.alive, o.probed)})`
        + ` - these are recoverable offline`);
}
if (report.signatures) {
    const s = report.signatures;
    console.log(`\nsigned URLs: ${s.expired}/${s.count} already expired`
        + `, median signature window ${s.medianWindowHours}h`
        + `, newest expiry ${s.latestExpiry.slice(0, 10)}`);
}
console.log(`\nunique users: ${users.size}  (one API call each to refresh avatars)`);
console.log(`report written to ${OUT}`);
