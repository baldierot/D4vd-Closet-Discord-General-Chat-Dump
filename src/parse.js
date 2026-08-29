export function splitGroups(html) {
    const marker = '<div class=chatlog__message-group>';
    const parts = html.split(marker);
    const groups = [];
    for (let i = 1; i < parts.length; i++) {
        groups.push(marker + parts[i]);
    }
    return groups;
}

export function annotateAuthorIds(root) {
    for (const author of root.querySelectorAll('.chatlog__author')) {
        if (author.querySelector('.chatlog__author-id')) continue;
        const username = author.getAttribute('title');
        if (!username) continue;
        if (username === author.textContent.trim()) continue;
        const idSpan = author.ownerDocument.createElement('span');
        idSpan.className = 'chatlog__author-id';
        idSpan.textContent = ' (' + username + ')';
        author.appendChild(idSpan);
    }
}
