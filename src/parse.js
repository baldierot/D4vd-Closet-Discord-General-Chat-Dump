export function splitGroups(html) {
    const marker = '<div class=chatlog__message-group>';
    const parts = html.split(marker);
    const groups = [];
    for (let i = 1; i < parts.length; i++) {
        groups.push(marker + parts[i]);
    }
    return groups;
}

// Both the message header (.chatlog__author) and the quoted author in a reply
// (.chatlog__reply-author) carry the username in a title attribute. They are
// the only two classes in the archive that do.
//
// The id is shown even when it repeats the nickname (8% of messages). Hiding it
// there made its absence ambiguous - you could not tell whether a user had no
// nickname or the annotation had failed.
export function annotateAuthorIds(root) {
    for (const author of root.querySelectorAll('.chatlog__author, .chatlog__reply-author')) {
        if (author.querySelector('.chatlog__author-id')) continue;
        const username = author.getAttribute('title');
        if (!username) continue;
        const idSpan = author.ownerDocument.createElement('span');
        idSpan.className = 'chatlog__author-id';
        idSpan.textContent = ' (' + username + ')';
        author.appendChild(idSpan);
    }
}
