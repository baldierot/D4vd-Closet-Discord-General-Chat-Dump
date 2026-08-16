export function splitGroups(html) {
    const marker = '<div class=chatlog__message-group>';
    const parts = html.split(marker);
    const groups = [];
    for (let i = 1; i < parts.length; i++) {
        groups.push(marker + parts[i]);
    }
    return groups;
}
