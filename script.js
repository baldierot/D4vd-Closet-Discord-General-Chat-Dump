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

    fetch('file_list.txt')
        .then(response => response.text())
        .then(data => {
            const files = data.split('\n').filter(file => file.trim() !== '');
            files.forEach((file, index) => {
                const listItem = document.createElement('li');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `file-${index}`;
                checkbox.dataset.filePath = file;

                const label = document.createElement('label');
                label.htmlFor = `file-${index}`;
                label.textContent = getFileName(file);

                listItem.appendChild(label);
                listItem.appendChild(checkbox);
                fileList.appendChild(listItem);
            });
        });

    const loadFiles = (files) => {
        let isFirstFile = true;

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

        const processFiles = async () => {
            for (const file of files) {
                try {
                    const response = await fetch(file);
                    if (!response.ok) {
                        console.error(`Failed to fetch ${file}: ${response.statusText}`);
                        continue;
                    }
                    const html = await response.text();
                    if (isFirstFile) {
                        setupIframe(html);
                        isFirstFile = false;
                    } else {
                        appendToIframe(html);
                    }
                } catch (error) {
                    console.error(`Error processing ${file}:`, error);
                }
            }
        };

        viewer.onload = () => {
            processFiles();
            viewer.onload = null; // Avoid re-triggering
        };
        viewer.src = 'about:blank'; // Clear the iframe and trigger onload
    };


    loadButton.addEventListener('click', () => {
        const checkedFiles = Array.from(fileList.querySelectorAll('input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.dataset.filePath);

        if (checkedFiles.length > 0) {
            loadFiles(checkedFiles);
        } else {
            // Clear iframe if no files are selected
            viewer.src = 'about:blank';
        }
    });

    menuButton.addEventListener('click', () => {
        body.classList.toggle('sidebar-open');
    });
});
