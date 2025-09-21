document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const fileListContainer = document.getElementById('file-list-container');
    const fileList = document.getElementById('file-list');
    const loadButton = document.getElementById('load-button');
    const viewer = document.getElementById('viewer');
    const menuButton = document.getElementById('menu-button');

    // Open sidebar by default
    body.classList.add('sidebar-open');

    const getFileName = (filePath) => {
        const url = new URL(filePath, window.location.href);
        const pathname = url.pathname;
        const basename = pathname.split('/').pop();
        return basename.split('.').slice(0, -1).join('.');
    }

    // --- Service Worker Setup ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });

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
                console.log('All files have been loaded by the service worker.');
            } else if (data.type === 'LOAD_ERROR') {
                console.error(`Service worker failed to load ${data.file}:`, data.error);
            }
        });
    }
    // --- End Service Worker Setup ---


    fetch('file_list.txt')
        .then(response => response.text())
        .then(data => {
            const files = data.split('\n').filter(file => file.trim() !== '');
            files.forEach((file, index) => {
                const listItem = document.createElement('li');
                const label = document.createElement('label');
                label.htmlFor = `file-${index}`;
                label.textContent = getFileName(file);

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `file-${index}`;
                checkbox.dataset.filePath = file;

                listItem.appendChild(label);
                listItem.appendChild(checkbox);
                fileList.appendChild(listItem);
            });
        });

    loadButton.addEventListener('click', () => {
        const checkedFiles = Array.from(fileList.querySelectorAll('input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.dataset.filePath);

        if (checkedFiles.length === 0) {
            viewer.src = 'about:blank';
            return;
        }

        if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
            alert('Service worker is not active. Please reload the page or try again in a moment.');
            return;
        }

        // Set up a one-time listener for when the iframe is cleared and ready
        viewer.onload = () => {
            navigator.serviceWorker.controller.postMessage({
                type: 'LOAD_FILES',
                files: checkedFiles
            });
            // Remove the listener so it doesn't fire for subsequent content loads
            viewer.onload = null;
        };

        // Trigger the onload event by setting the src
        viewer.src = 'about:blank';
    });

    menuButton.addEventListener('click', () => {
        body.classList.toggle('sidebar-open');
    });
});