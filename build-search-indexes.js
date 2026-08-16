const fs = require('fs');
const path = require('path');
const { Worker, isMainThread, parentPort } = require('worker_threads');

const WORKERS = 15;
const CHUNK_BYTES = 256 * 1024 * 1024;
const outDir = 'days-search-indexes';

if (isMainThread) {
    const manifest = JSON.parse(fs.readFileSync('day-manifest.json', 'utf8'));
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

    let totalEntries = 0;
    let completed = 0;
    const startTime = Date.now();

    const chunks = [];
    let current = { days: [], bytes: 0 };
    for (const day of manifest) {
        current.days.push(day);
        current.bytes += day.htmlSize || 0;
        if (current.bytes >= CHUNK_BYTES) {
            chunks.push(current.days);
            current = { days: [], bytes: 0 };
        }
    }
    if (current.days.length > 0) chunks.push(current.days);

    process.stderr.write(`Split into ${chunks.length} chunks of ~1GB each\n\n`);

    (async () => {
        for (let ci = 0; ci < chunks.length; ci++) {
            const days = chunks[ci];
            process.stderr.write(`--- Chunk ${ci + 1}/${chunks.length}: loading ${days.length} days ---\n`);

            const loaded = [];
            for (let di = 0; di < days.length; di++) {
                const day = days[di];
                const htmlPath = path.join('days', day.date + '.html');
                if (!fs.existsSync(htmlPath)) continue;
                try {
                    const sizeMB = (day.htmlSize / 1024 / 1024).toFixed(1);
                    process.stderr.write(`  Reading ${day.date} (${sizeMB}MB) [${di + 1}/${days.length}]\n`);
                    const html = fs.readFileSync(htmlPath, 'utf8');
                    loaded.push({ date: day.date, html });
                } catch (err) {
                    process.stderr.write(`  Warning: skipping ${day.date}: ${err.code}\n`);
                }
            }

            process.stderr.write(`Loaded ${loaded.length} files, processing...\n`);

            const results = await processChunk(loaded);
            for (const r of results) {
                completed++;
                totalEntries += r.entries;
                process.stderr.write(`[${completed}/${manifest.length}] ${r.date}: ${r.entries} entries (${r.sizeKB}KB)\n`);
            }

            loaded.length = 0;
            if (global.gc) global.gc();
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        process.stderr.write(`\nDone: ${totalEntries} entries across ${completed} days in ${elapsed}s\n`);
    })();

    function processChunk(loaded) {
        return new Promise((resolve) => {
            const results = [];
            let next = 0;
            let active = 0;

            function spawn() {
                while (active < WORKERS && next < loaded.length) {
                    const idx = next++;
                    const item = loaded[idx];
                    active++;
                    const worker = new Worker(__filename);
                    worker.postMessage({ date: item.date, html: item.html });
                    loaded[idx] = null;
                    worker.on('message', (msg) => {
                        results.push(msg);
                        active--;
                        worker.terminate();
                        if (next < loaded.length) spawn();
                        else if (active === 0) resolve(results);
                    });
                    worker.on('error', (err) => {
                        process.stderr.write(`Worker error: ${err.message}\n`);
                        active--;
                        if (active === 0 && next >= loaded.length) resolve(results);
                    });
                }
                if (loaded.length === 0) resolve(results);
            }
            spawn();
        });
    }
} else {
    function stripTags(s) {
        let out = '';
        let inTag = false;
        for (let i = 0; i < s.length; i++) {
            if (s[i] === '<') inTag = true;
            else if (s[i] === '>') inTag = false;
            else if (!inTag) out += s[i];
        }
        return out.trim();
    }

    function extractContent(block) {
        const parts = [];
        const needle = 'chatlog__markdown-preserve>';
        let pos = 0;
        while ((pos = block.indexOf(needle, pos)) !== -1) {
            pos += needle.length;
            const end = block.indexOf('</span>', pos);
            if (end === -1) break;
            const text = stripTags(block.slice(pos, end)).trim();
            if (text) parts.push(text);
            pos = end;
        }
        return parts.join(' ');
    }

    function extractAuthor(block) {
        const idx = block.indexOf('chatlog__author');
        if (idx === -1) return { username: '', displayName: '' };
        const tagEnd = block.indexOf('>', idx);
        if (tagEnd === -1) return { username: '', displayName: '' };
        const tag = block.slice(idx, tagEnd);

        let username = '';
        const titleIdx = tag.indexOf('title=');
        if (titleIdx !== -1) {
            const start = titleIdx + 6;
            let end = start;
            while (end < tag.length && tag[end] !== ' ' && tag[end] !== '>') end++;
            username = tag.slice(start, end);
        }

        let displayName = '';
        const contentEnd = block.indexOf('<', tagEnd + 1);
        if (contentEnd !== -1) {
            displayName = block.slice(tagEnd + 1, contentEnd).trim();
        }

        return { username: username || displayName, displayName: displayName || username };
    }

    parentPort.on('message', (msg) => {
        const { date, html } = msg;
        const entries = [];
        const groups = html.split('<div class=chatlog__message-group>');

        for (let g = 1; g < groups.length; g++) {
            const group = groups[g];
            const groupAuthor = extractAuthor(group);

            const containerRe = /id=(chatlog__message-container-\d+)/g;
            let match;
            const cpos = [];
            while ((match = containerRe.exec(group)) !== null) {
                cpos.push({ id: match[1], pos: match.index });
            }

            for (let c = 0; c < cpos.length; c++) {
                const end = c + 1 < cpos.length ? cpos[c + 1].pos : group.length;
                const block = group.slice(cpos[c].pos, end);
                const blockAuthor = extractAuthor(block);
                const author = blockAuthor.username ? blockAuthor : groupAuthor;
                entries.push({
                    messageId: cpos[c].id,
                    author: author.username,
                    displayName: author.displayName,
                    content: extractContent(block),
                });
            }
        }

        const outPath = path.join(outDir, date + '.json');
        fs.writeFileSync(outPath, JSON.stringify(entries));
        const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(0);

        parentPort.postMessage({ date, entries: entries.length, sizeKB });
    });
}
