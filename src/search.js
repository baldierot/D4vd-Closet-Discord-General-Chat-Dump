export function filterMessages(searchIndex, term, filter) {
    if (!searchIndex || !term) return new Set();

    const lower = term.toLowerCase();
    const matchIds = new Set();

    for (const msg of searchIndex) {
        let match = false;
        if (filter === 'author' || filter === 'both') {
            if (msg.author.toLowerCase().includes(lower)) match = true;
        }
        if (!match && (filter === 'content' || filter === 'both')) {
            if (msg.content.toLowerCase().includes(lower)) match = true;
        }
        if (match) matchIds.add(msg.messageId);
    }

    return matchIds;
}
