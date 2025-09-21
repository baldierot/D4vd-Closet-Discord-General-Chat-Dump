self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'LOAD_FILES') {
        const { files } = event.data;
        if (files && files.length > 0) {
            loadAndPostFiles(files, event.source);
        }
    }
});

async function loadAndPostFiles(files, client) {
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const response = await fetch(file);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const content = await response.text();
            client.postMessage({
                type: 'FILE_LOADED',
                file: file,
                content: content,
                isFirst: i === 0
            });
        } catch (error) {
            client.postMessage({
                type: 'LOAD_ERROR',
                file: file,
                error: error.message
            });
        }
    }
    client.postMessage({ type: 'ALL_FILES_LOADED' });
}
