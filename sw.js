const DB_NAME = 'search-indexes-db';
const DB_VERSION = 1;
const STORE_NAME = 'search-indexes';

let searchIndexes = {};

function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
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
        const request = store.openCursor();
        const results = {};

        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                results[cursor.key] = cursor.value;
                cursor.continue();
            } else {
                resolve(results);
            }
        };

        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

self.addEventListener('install', (event) => { 
    console.log('Service worker installing...');
    self.skipWaiting(); 
});

self.addEventListener('activate', (event) => {
    console.log('Service worker activating...');
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
    console.log('Loading HTML and indexes...');
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
                console.log(`Saving indexes for ${file} to DB.`);
                await saveIndexesToDb(db, file, indexes);
            }

        } catch (error) {
            client.postMessage({ type: 'LOAD_ERROR', file: file, error: error.message });
        }
    }
    console.log('Finished loading HTML and indexes.');
    client.postMessage({ type: 'ALL_FILES_LOADED' });
}

async function searchWithCachedIndexes(searchTerm, filter, client) {
    console.log('Searching with cached indexes...');
    if (Object.keys(searchIndexes).length === 0) {
        console.log('searchIndexes is empty. Loading from DB...');
        try {
            const db = await openDb();
            searchIndexes = await loadIndexesFromDb(db);
            console.log('Loaded indexes from DB:', searchIndexes);
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