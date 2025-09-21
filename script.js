document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const fileListContainer = document.getElementById('file-list-container');
    const fileList = document.getElementById('file-list');
    const loadButton = document.getElementById('load-button');
    const viewer = document.getElementById('viewer');
    const menuButton = document.getElementById('menu-button');
    let selectedFile = null;
    let loadedFile = null;

    // Open sidebar by default
    body.classList.add('sidebar-open');

    const getFileName = (filePath) => {
        const url = new URL(filePath, window.location.href);
        const pathname = url.pathname;
        const basename = pathname.split('/').pop();
        return basename.split('.').slice(0, -1).join('.');
    }

    const loadFile = (filePath) => {
        if (!filePath) {
            if (loadedFile) {
                loadedFile.classList.remove('loaded');
            }
            if (selectedFile) {
                selectedFile.classList.remove('selected');
            }
            viewer.src = 'about:blank';
            selectedFile = null;
            loadedFile = null;
            return;
        }

        if (loadedFile) {
            loadedFile.classList.remove('loaded');
        }

        fetch(filePath)
            .then(response => response.text())
            .then(html => {
                viewer.src = 'about:blank'; // Clear the iframe before writing
                viewer.contentWindow.document.open();
                viewer.contentWindow.document.write(html);
                viewer.contentWindow.document.close();
                viewer.contentWindow.scrollTo(0, 0); // Scroll to top
            });

        const fileListItem = Array.from(fileList.children).find(item => item.dataset.filePath === filePath);
        if (fileListItem) {
            if (selectedFile) {
                selectedFile.classList.remove('selected');
            }
            selectedFile = fileListItem;
            selectedFile.classList.add('selected');
            loadedFile = selectedFile;
            loadedFile.classList.add('loaded');
            selectedFile.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    };

    const loadFileFromHash = () => {
        const filename = window.location.hash.substring(1);
        if (filename) {
            const fileListItem = Array.from(fileList.children).find(item => item.textContent === filename);
            if (fileListItem) {
                loadFile(fileListItem.dataset.filePath);
            }
        } else {
            loadFile(null);
        }
    }

    fetch('file_list.txt')
        .then(response => response.text())
        .then(data => {
            const files = data.split('\n').filter(file => file.trim() !== '');
            files.forEach(file => {
                const listItem = document.createElement('li');
                const filename = getFileName(file);
                listItem.textContent = filename;
                listItem.dataset.filePath = file;
                listItem.addEventListener('click', () => {
                    if (selectedFile) {
                        selectedFile.classList.remove('selected');
                    }
                    selectedFile = listItem;
                    selectedFile.classList.add('selected');
                });
                fileList.appendChild(listItem);
            });

            // Initial load
            loadFileFromHash();
        });

    loadButton.addEventListener('click', () => {
        if (selectedFile) {
            const filePath = selectedFile.dataset.filePath;
            const filename = getFileName(filePath);
            window.location.hash = filename;
        }
    });

    window.addEventListener('hashchange', loadFileFromHash);

    menuButton.addEventListener('click', () => {
        body.classList.toggle('sidebar-open');
    });
});