const fs = require('fs');
const path = require('path');

const CHUNK_MAX_BYTES = 20 * 1024 * 1024;
const manifest = JSON.parse(fs.readFileSync('day-manifest.json', 'utf8'));

const authorSet = new Map();
const displayNameSet = new Map();
const days = [];
const dayOffsets = [];
const allDi = [];
const allAi = [];
const allDni = [];
const allC = [];

let entryCount = 0;

for (let dayIdx = 0; dayIdx < manifest.length; dayIdx++) {
    const day = manifest[dayIdx];
    days.push(day.date);
    dayOffsets.push(entryCount);

    const idxPath = path.join('days-search-indexes', day.date + '.json');
    if (!fs.existsSync(idxPath)) continue;

    const entries = JSON.parse(fs.readFileSync(idxPath, 'utf8'));

    for (const entry of entries) {
        const authorLower = entry.author.toLowerCase();
        if (!authorSet.has(authorLower)) {
            authorSet.set(authorLower, { idx: authorSet.size, display: entry.author });
        }

        const dn = entry.displayName || entry.author;
        const dnLower = dn.toLowerCase();
        if (!displayNameSet.has(dnLower)) {
            displayNameSet.set(dnLower, { idx: displayNameSet.size, display: dn });
        }

        allDi.push(dayIdx);
        allAi.push(authorSet.get(authorLower).idx);
        allDni.push(displayNameSet.get(dnLower).idx);
        allC.push(entry.content);
        entryCount++;
    }

    if ((dayIdx + 1) % 100 === 0) {
        process.stderr.write(`Processed ${dayIdx + 1}/${manifest.length} days (${entryCount} entries)\n`);
    }
}

const authors = new Array(authorSet.size);
for (const [, { idx, display }] of authorSet) {
    authors[idx] = display;
}

const displayNames = new Array(displayNameSet.size);
for (const [, { idx, display }] of displayNameSet) {
    displayNames[idx] = display;
}

// Split into chunks
let chunkIdx = 0;
let start = 0;
let totalSize = 0;

while (start < entryCount) {
    let end = start;
    let size = 0;
    while (end < entryCount) {
        const entryCost = JSON.stringify(allC[end]).length + 20;
        if (size + entryCost > CHUNK_MAX_BYTES && end > start) break;
        size += entryCost;
        end++;
    }

    const chunk = {
        di: allDi.slice(start, end),
        ai: allAi.slice(start, end),
        dni: allDni.slice(start, end),
        c: allC.slice(start, end),
    };
    const json = JSON.stringify(chunk);
    const filename = `search-data-${chunkIdx}.json`;
    fs.writeFileSync(filename, json);
    const mb = (Buffer.byteLength(json) / 1024 / 1024).toFixed(1);
    process.stderr.write(`${filename}: ${mb} MB (${end - start} entries)\n`);
    totalSize += Buffer.byteLength(json);
    chunkIdx++;
    start = end;
}

const meta = { days, dayOffsets, authors, displayNames, chunks: chunkIdx };
const metaJson = JSON.stringify(meta);
fs.writeFileSync('search-data-meta.json', metaJson);
totalSize += Buffer.byteLength(metaJson);

// Clean up old single file
if (fs.existsSync('search-data.json')) fs.unlinkSync('search-data.json');

process.stderr.write(`\nDone: ${entryCount} entries, ${authors.length} authors, ${displayNames.length} display names\n`);
process.stderr.write(`${chunkIdx} chunks + meta, total ${(totalSize / 1024 / 1024).toFixed(1)} MB\n`);
