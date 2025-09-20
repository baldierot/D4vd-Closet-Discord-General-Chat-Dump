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

    fetch('file_list.txt')
        .then(response => response.text())
        .then(data => {
            const files = data.split('\n').filter(file => file.trim() !== '');
            files.forEach(file => {
                const listItem = document.createElement('li');
                const url = new URL(file, window.location.href);
                const pathname = url.pathname;
                const basename = pathname.split('/').pop();
                const filename = basename.split('.').slice(0, -1).join('.');
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
        });

    loadButton.addEventListener('click', () => {
        if (selectedFile) {
            if (loadedFile) {
                loadedFile.classList.remove('loaded');
            }
            viewer.src = selectedFile.dataset.filePath;
            loadedFile = selectedFile;
            loadedFile.classList.add('loaded');
        }
    });

    menuButton.addEventListener('click', () => {
        body.classList.toggle('sidebar-open');
    });
});
