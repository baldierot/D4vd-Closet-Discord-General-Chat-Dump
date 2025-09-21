document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const fileListContainer = document.getElementById('file-list-container');
    const fileList = document.getElementById('file-list');
    const loadButton = document.getElementById('load-button');
    const viewer = document.getElementById('viewer');
    const menuButton = document.getElementById('menu-button');
    const loadingOverlay = document.getElementById('loading-overlay');
    const searchFilter = document.getElementById('search-filter');
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    let messageGroupCache = [];

    body.classList.add('sidebar-open');

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
            switch (data.type) {
                case 'FILE_LOADED':
                    if (data.isFirst) {
                        setupIframe(data.content);
                    } else {
                        appendToIframe(data.content);
                    }
                    break;
                case 'ALL_FILES_LOADED':
                    const iframeDoc = viewer.contentWindow.document;
                    messageGroupCache = Array.from(iframeDoc.querySelectorAll('.chatlog__message-group'));
                    loadingOverlay.classList.add('hidden');
                    console.log(`UI element cache created with ${messageGroupCache.length} message groups.`);
                    break;
                case 'LOAD_ERROR':
                    console.error(`Service worker failed to load ${data.file}:`, data.error);
                    loadingOverlay.classList.add('hidden');
                    break;
                case 'SEARCH_COMPLETE':
                    const matchingIds = new Set(data.matchingMessageIds);

                    if (searchInput.value.trim() === '') {
                        messageGroupCache.forEach(group => {
                            group.style.display = '';
                        });
                    } else {
                        messageGroupCache.forEach(group => {
                            const messageContainer = group.querySelector('[id^="chatlog__message-container-"]');
                            if (messageContainer && matchingIds.has(messageContainer.id)) {
                                group.style.display = '';
                            } else {
                                group.style.display = 'none';
                            }
                        });
                    }
                    loadingOverlay.classList.add('hidden');
                    break;
            }
        });
    }

    const triggerFileLoad = (files) => {
        messageGroupCache = [];
        if (files.length === 0) {
            viewer.src = 'about:blank';
            loadingOverlay.classList.add('hidden');
            return;
        }

        if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
            alert('Service worker is not active. Please reload the page or try again in a moment.');
            loadingOverlay.classList.add('hidden');
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
        let firstCheckedElement = null;

        document.querySelectorAll('#file-list li').forEach(li => li.classList.remove('active'));

        const allCheckboxes = fileList.querySelectorAll('input[type="checkbox"]');
        if (allCheckboxes.length === 0 && hash) {
            setTimeout(loadStateFromHash, 100);
            return;
        }
        
        allCheckboxes.forEach(cb => cb.checked = false);

        filenamesFromHash.forEach(filename => {
            const checkbox = Array.from(allCheckboxes).find(cb => cb.dataset.filename === filename);
            if (checkbox) {
                checkbox.checked = true;
                checkbox.closest('li').classList.add('active');
                filesToLoad.push(checkbox.dataset.filePath);
                if (!firstCheckedElement) {
                    firstCheckedElement = checkbox;
                }
            }
        });

        if (firstCheckedElement) {
            firstCheckedElement.parentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        triggerFileLoad(filesToLoad);
    };

    fetch('manifest.json')
        .then(response => response.json())
        .then(files => {
            files.forEach((file, index) => {
                const listItem = document.createElement('li');
                const label = document.createElement('label');
                const filename = getFileName(file);
                label.htmlFor = `file-${index}`;
                label.textContent = filename.replace('_', ' ');

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
            loadStateFromHash();
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

    searchButton.addEventListener('click', () => {
        const searchTerm = searchInput.value;
        const filter = searchFilter.value;

        if (!navigator.serviceWorker.controller) {
            alert('Service worker is not ready.');
            return;
        }

        loadingOverlay.classList.remove('hidden');
        
        navigator.serviceWorker.controller.postMessage({
            type: 'SEARCH_FILES',
            searchTerm: searchTerm,
            searchFilter: filter
        });
    });

    searchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            searchButton.click();
        } else if (searchInput.value.trim() === '') {
            messageGroupCache.forEach(group => {
                group.style.display = '';
            });
        }
    });

    menuButton.addEventListener('click', () => {
        body.classList.toggle('sidebar-open');
    });
});