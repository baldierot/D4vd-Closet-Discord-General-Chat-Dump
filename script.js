document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const fileListContainer = document.getElementById('file-list-container');
    const fileList = document.getElementById('file-list');
    const loadButton = document.getElementById('load-button');
    const viewer = document.getElementById('viewer');
    const menuButton = document.getElementById('menu-button');
    const loadingOverlay = document.getElementById('loading-overlay');

    body.classList.add('sidebar-open');

    // Show loader immediately if the page is loading from a hash
    if (window.location.hash.substring(1)) {
        loadingOverlay.classList.remove('hidden');
    }

    const getFileName = (filePath) => {
        const url = new URL(filePath, window.location.href);
        const pathname = url.pathname;
        const basename = pathname.split('/').pop();
        return basename.split('.').slice(0, -1).join('.');
    };

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered.', reg))
            .catch(err => console.error('Service Worker registration failed:', err));

        const setupIframe = (html) => {
            viewer.contentWindow.document.open();
            viewer.contentWindow.document.write(html);
            viewer.contentWindow.document.close();
        };

        const appendToIframe = (html) => {
            const bodyContentMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyContentMatch && bodyContentMatch[1]) {
                viewer.contentWindow.document.body.insertAdjacentHTML('beforeend', bodyContentMatch[1]);
            }
        };

        navigator.serviceWorker.addEventListener('message', event => {
            const { data } = event;
            if (data.type === 'FILE_LOADED') {
                if (data.isFirst) {
                    setupIframe(data.content);
                } else {
                    appendToIframe(data.content);
                }
            } else if (data.type === 'ALL_FILES_LOADED') {
                loadingOverlay.classList.add('hidden');
            } else if (data.type === 'LOAD_ERROR') {
                console.error(`Service worker failed to load ${data.file}:`, data.error);
                loadingOverlay.classList.add('hidden');
            }
        });
    }

    const triggerFileLoad = (files) => {
        if (files.length === 0) {
            viewer.src = 'about:blank';
            loadingOverlay.classList.add('hidden');
            return;
        }

        if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
            alert('Service worker is not active. Please reload the page or try again in a moment.');
            loadingOverlay.classList.add('hidden'); // Hide loader if we can't proceed
            return;
        }

        loadingOverlay.classList.remove('hidden');

        viewer.onload = () => {
            navigator.serviceWorker.controller.postMessage({
                type: 'LOAD_FILES',
                files: files
            });
            viewer.onload = null;
        };

        viewer.src = 'about:blank';
    };

    const loadStateFromHash = () => {
        const hash = window.location.hash.substring(1);
        const filenamesFromHash = hash ? hash.split(',') : [];
        const filesToLoad = [];

        const allCheckboxes = fileList.querySelectorAll('input[type="checkbox"]');
        if (allCheckboxes.length === 0 && hash) {
            // File list not populated yet, try again shortly.
            setTimeout(loadStateFromHash, 100);
            return;
        }
        
        allCheckboxes.forEach(cb => cb.checked = false);

        filenamesFromHash.forEach(filename => {
            const checkbox = Array.from(allCheckboxes).find(cb => cb.dataset.filename === filename);
            if (checkbox) {
                checkbox.checked = true;
                filesToLoad.push(checkbox.dataset.filePath);
            }
        });

        triggerFileLoad(filesToLoad);
    };

    fetch('file_list.txt')
        .then(response => response.text())
        .then(data => {
            const files = data.split('\n').filter(file => file.trim() !== '');
            files.forEach((file, index) => {
                const listItem = document.createElement('li');
                const label = document.createElement('label');
                const filename = getFileName(file);
                label.htmlFor = `file-${index}`;
                label.textContent = filename;

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `file-${index}`;
                checkbox.dataset.filePath = file;
                checkbox.dataset.filename = filename;

                listItem.appendChild(label);
                listItem.appendChild(checkbox);
                fileList.appendChild(listItem);
            });

            window.addEventListener('hashchange', loadStateFromHash);
            loadStateFromHash(); // Initial load
        });

    loadButton.addEventListener('click', () => {
        const checkedFilenames = Array.from(fileList.querySelectorAll('input[type="checkbox"]:checked'))
            .map(cb => cb.dataset.filename);
        
        const newHash = checkedFilenames.join(',');

        if (window.location.hash.substring(1) === newHash) {
            loadStateFromHash();
        } else {
            window.location.hash = newHash;
        }
    });

    menuButton.addEventListener('click', () => {
        body.classList.toggle('sidebar-open');
    });
});
