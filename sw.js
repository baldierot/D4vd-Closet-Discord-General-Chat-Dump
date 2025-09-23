const DB_NAME = 'search-indexes-db';
const DB_VERSION = 1;
const STORE_NAME = 'search-indexes';

let searchIndexes = {};

function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            db.createObjectStore(STORE_NAME);
        };
        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

function saveIndexesToDb(db, file, indexes) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(indexes, file);
        request.onsuccess = () => {
            resolve();
        };
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

function loadIndexesFromDb(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        const keysRequest = store.getAllKeys();

        let results = {};
        keysRequest.onsuccess = () => {
            request.onsuccess = () => {
                for(let i = 0; i < request.result.length; i++) {
                    results[keysRequest.result[i]] = request.result[i];
                }
                resolve(results);
            };
        }

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

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
    const db = await openDb();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear();

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
                const indexes = await indexResponse.json();
                searchIndexes[file] = indexes;
                await saveIndexesToDb(db, file, indexes);
            }

        } catch (error) {
            client.postMessage({ type: 'LOAD_ERROR', file: file, error: error.message });
        }
    }
    client.postMessage({ type: 'ALL_FILES_LOADED' });
}

async function searchWithCachedIndexes(searchTerm, filter, client) {
    if (Object.keys(searchIndexes).length === 0) {
        try {
            const db = await openDb();
            searchIndexes = await loadIndexesFromDb(db);
        } catch (error) {
            console.error("Failed to load indexes from DB:", error);
        }
    }

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