const fs = require('fs');
const path = require('path');

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

const result = { days, dayOffsets, authors, displayNames, di: allDi, ai: allAi, dni: allDni, c: allC };
const json = JSON.stringify(result);
fs.writeFileSync('search-data.json', json);

const rawMB = (Buffer.byteLength(json) / 1024 / 1024).toFixed(1);
process.stderr.write(`\nDone: ${entryCount} entries, ${authors.length} authors, ${displayNames.length} display names\n`);
process.stderr.write(`search-data.json: ${rawMB} MB (will be ~${(rawMB / 3.3).toFixed(0)} MB gzipped by server)\n`);
