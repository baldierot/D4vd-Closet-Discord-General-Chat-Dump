let searchIndexes = {};

self.addEventListener('install', (event) => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
    searchIndexes = {};
    event.waitUntil(clients.claim());
});

self.addEventListener('message', (event) => {
    if (!event.data) return;

    switch (event.data.type) {
        case 'LOAD_FILES':
            searchIndexes = {};
            loadHtmlAndIndexes(event.data.files, event.source);
            break;
        case 'SEARCH_FILES':
            searchWithCachedIndexes(event.data.searchTerm, event.data.searchFilter, event.source);
            break;
    }
});

async function loadHtmlAndIndexes(files, client) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const htmlResponse = await fetch(file);
            if (!htmlResponse.ok) throw new Error(`HTTP error! status: ${htmlResponse.status}`);
            const content = await htmlResponse.text();
            client.postMessage({
                type: 'FILE_LOADED',
                file: file,
                content: content,
                isFirst: i === 0
            });

            const indexFile = file.replace('split-parts', 'split-parts-search-indexes').replace('.html', '.json');
            const indexResponse = await fetch(indexFile);
            if (indexResponse.ok) {
                searchIndexes[file] = await indexResponse.json();
            }

        } catch (error) {
            client.postMessage({ type: 'LOAD_ERROR', file: file, error: error.message });
        }
    }
    client.postMessage({ type: 'ALL_FILES_LOADED' });
}

function searchWithCachedIndexes(searchTerm, filter, client) {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    if (!lowerCaseSearchTerm) {
        client.postMessage({ type: 'SEARCH_COMPLETE', matchingMessageIds: [] });
        return;
    }

    const matchingMessageIds = new Set();
    const allMessages = Object.values(searchIndexes).flat();

    for (const message of allMessages) {
        let isMatch = false;
        if (filter === 'author' || filter === 'both') {
            if (message.author.includes(lowerCaseSearchTerm)) isMatch = true;
        }
        if (!isMatch && (filter === 'content' || filter === 'both')) {
            if (message.content.includes(lowerCaseSearchTerm)) isMatch = true;
        }
        if (isMatch) {
            matchingMessageIds.add(message.messageId);
        }
    }

    client.postMessage({
        type: 'SEARCH_COMPLETE',
        matchingMessageIds: Array.from(matchingMessageIds)
    });
}