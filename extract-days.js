#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SOURCE_DIR = path.join(ROOT, 'split-parts');
const SOURCE_INDEX_DIR = path.join(ROOT, 'split-parts-search-indexes');
const DAYS_DIR = path.join(ROOT, 'days');
const DAYS_INDEX_DIR = path.join(ROOT, 'days-search-indexes');
const MANIFEST_PATH = path.join(ROOT, 'day-manifest.json');

const DISCORD_EPOCH = 1420070400000n;
const UTC_OFFSET_MS = -5 * 60 * 60 * 1000; // UTC-5 as stated in export postamble

function parseDateFromTimestampText(text) {
    const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!match) return null;
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function getDateFromGroup(groupHtml) {
    // Primary: full timestamp anchor text like >2/20/2023 12:20 AM<
    const fullMatch = groupHtml.match(/class=chatlog__timestamp[^>]*>(?:<a[^>]*>)(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (fullMatch) return parseDateFromTimestampText(fullMatch[1]);

    // Fallback: title attribute on short-timestamp
    const shortMatch = groupHtml.match(/class=chatlog__short-timestamp[^>]*title="[^,]+,\s+(\w+)\s+(\d+),\s+(\d{4})/);
    if (shortMatch) {
        const months = {
            January:'01', February:'02', March:'03', April:'04', May:'05', June:'06',
            July:'07', August:'08', September:'09', October:'10', November:'11', December:'12'
        };
        return `${shortMatch[3]}-${months[shortMatch[1]]}-${shortMatch[2].padStart(2, '0')}`;
    }

    // Last resort: extract from Discord snowflake in message ID
    const idMatch = groupHtml.match(/data-message-id=(\d+)/);
    if (idMatch) {
        const ts = Number((BigInt(idMatch[1]) >> 22n) + DISCORD_EPOCH);
        const d = new Date(ts + UTC_OFFSET_MS);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    }

    return null;
}

function snowflakeDateKey(snowflakeStr) {
    const ts = Number((BigInt(snowflakeStr) >> 22n) + DISCORD_EPOCH);
    const d = new Date(ts + UTC_OFFSET_MS);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

function splitMessageGroups(html) {
    const marker = '<div class=chatlog__message-group>';
    const parts = html.split(marker);
    // parts[0] = everything before the first message group (head, body open, chatlog open)
    // parts[1..n] = content of each group (without the opening marker)
    const groups = [];
    for (let i = 1; i < parts.length; i++) {
        let content = parts[i];
        // Last part may have trailing </div></body></html> or postamble
        if (i === parts.length - 1) {
            // Remove trailing chatlog/body/html close and any postamble
            content = content.replace(/<\/div>\s*(<div class="postamble">[\s\S]*)?<\/body>\s*<\/html>\s*$/, '');
            // Also handle case where it's just </div></body></html>
            content = content.replace(/<\/div>\s*$/, '');
        }
        groups.push(marker + content);
    }
    return groups;
}

async function main() {
    console.log('=== Discord Chat Dump Day Extractor ===\n');

    // Clean output directories
    if (fs.existsSync(DAYS_DIR)) fs.rmSync(DAYS_DIR, { recursive: true });
    if (fs.existsSync(DAYS_INDEX_DIR)) fs.rmSync(DAYS_INDEX_DIR, { recursive: true });
    fs.mkdirSync(DAYS_DIR, { recursive: true });
    fs.mkdirSync(DAYS_INDEX_DIR, { recursive: true });

    // Get sorted file lists
    const htmlFiles = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.html')).sort();
    console.log(`Found ${htmlFiles.length} HTML source files`);

    // Process HTML files
    console.log('Processing HTML files into per-day fragments...');
    const dayStats = {}; // date -> { groupCount, messageCount }
    const dayFileHandles = {}; // date -> fd
    let totalGroups = 0;
    let totalMessages = 0;
    let filesWithErrors = 0;

    for (let i = 0; i < htmlFiles.length; i++) {
        const file = htmlFiles[i];
        process.stdout.write(`\r  [${i+1}/${htmlFiles.length}] ${file}`);

        const html = fs.readFileSync(path.join(SOURCE_DIR, file), 'utf-8');
        const groups = splitMessageGroups(html);

        if (groups.length === 0) {
            filesWithErrors++;
            continue;
        }

        // Group by date
        const byDate = {};
        for (const group of groups) {
            const date = getDateFromGroup(group);
            if (!date) {
                filesWithErrors++;
                continue;
            }
            if (!byDate[date]) byDate[date] = [];
            byDate[date].push(group);
        }

        // Append to day files
        for (const [date, dateGroups] of Object.entries(byDate)) {
            const dayFile = path.join(DAYS_DIR, `${date}.html`);
            const chunk = dateGroups.join('\n') + '\n';
            fs.appendFileSync(dayFile, chunk);

            if (!dayStats[date]) dayStats[date] = { groupCount: 0, messageCount: 0 };
            dayStats[date].groupCount += dateGroups.length;
            totalGroups += dateGroups.length;

            for (const g of dateGroups) {
                const count = (g.match(/data-message-id=/g) || []).length;
                dayStats[date].messageCount += count;
                totalMessages += count;
            }
        }
    }

    // Close all file handles
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    console.log(`  Processed ${htmlFiles.length} files → ${Object.keys(dayStats).length} days`);
    console.log(`  Total: ${totalGroups.toLocaleString()} message groups, ${totalMessages.toLocaleString()} messages`);
    if (filesWithErrors > 0) console.log(`  Warnings: ${filesWithErrors} groups/files with parse issues`);

    // Process search indexes
    console.log('\nRegrouping search indexes by day...');
    const indexFiles = fs.readdirSync(SOURCE_INDEX_DIR).filter(f => f.endsWith('.json')).sort();
    const dayIndexes = {};
    let totalIndexEntries = 0;

    for (let i = 0; i < indexFiles.length; i++) {
        if (i % 100 === 0) process.stdout.write(`\r  [${i+1}/${indexFiles.length}]`);
        const content = fs.readFileSync(path.join(SOURCE_INDEX_DIR, indexFiles[i]), 'utf-8');
        const messages = JSON.parse(content);

        for (const msg of messages) {
            const snowflake = msg.messageId.replace('chatlog__message-container-', '');
            let dateKey;
            try {
                dateKey = snowflakeDateKey(snowflake);
            } catch {
                continue;
            }
            if (!dayIndexes[dateKey]) dayIndexes[dateKey] = [];
            dayIndexes[dateKey].push(msg);
            totalIndexEntries++;
        }
    }

    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    console.log(`  Processed ${indexFiles.length} index files → ${Object.keys(dayIndexes).length} day indexes`);
    console.log(`  Total: ${totalIndexEntries.toLocaleString()} search entries`);

    // Write per-day index files
    console.log('  Writing per-day index files...');
    for (const [date, messages] of Object.entries(dayIndexes)) {
        fs.writeFileSync(path.join(DAYS_INDEX_DIR, `${date}.json`), JSON.stringify(messages));
    }

    // Build manifest
    console.log('\nBuilding manifest...');
    const dates = [...new Set([...Object.keys(dayStats), ...Object.keys(dayIndexes)])].sort();
    const manifest = dates.map(date => {
        const stats = dayStats[date] || { groupCount: 0, messageCount: 0 };
        const dayFilePath = path.join(DAYS_DIR, `${date}.html`);
        const indexFilePath = path.join(DAYS_INDEX_DIR, `${date}.json`);
        return {
            date,
            messageCount: stats.messageCount,
            groupCount: stats.groupCount,
            htmlSize: fs.existsSync(dayFilePath) ? fs.statSync(dayFilePath).size : 0,
            indexSize: fs.existsSync(indexFilePath) ? fs.statSync(indexFilePath).size : 0,
        };
    });

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

    // Summary
    const largest = manifest.reduce((max, d) => d.messageCount > max.messageCount ? d : max, manifest[0]);
    const totalHtmlSize = manifest.reduce((s, d) => s + d.htmlSize, 0);
    const totalIndexSize = manifest.reduce((s, d) => s + d.indexSize, 0);

    console.log('\n=== Summary ===');
    console.log(`Days:         ${manifest.length}`);
    console.log(`Date range:   ${manifest[0].date} to ${manifest[manifest.length-1].date}`);
    console.log(`Messages:     ${totalMessages.toLocaleString()}`);
    console.log(`HTML total:   ${(totalHtmlSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
    console.log(`Index total:  ${(totalIndexSize / 1024 / 1024).toFixed(1)} MB`);
    console.log(`Largest day:  ${largest.date} (${largest.messageCount.toLocaleString()} messages, ${(largest.htmlSize / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`\nOutput: ${DAYS_DIR}/ (${manifest.length} files)`);
    console.log(`        ${DAYS_INDEX_DIR}/ (${Object.keys(dayIndexes).length} files)`);
    console.log(`        ${path.basename(MANIFEST_PATH)}`);
}

main().catch(err => {
    console.error('\nFatal error:', err);
    process.exit(1);
});
