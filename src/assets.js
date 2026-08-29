// Pure helpers for classifying and repairing the asset URLs baked into the
// day HTML. No DOM, no network — so both the browser and the Node scripts
// (audit-assets.mjs, refresh-avatars.mjs) can share them.

export const DISCORD_EPOCH = 1420070400000n;

export const CLASSES = [
    'avatar',        // cdn.discordapp.com/avatars/{user}/{hash}  - stale when user changes avatar
    'defaultAvatar', // cdn.discordapp.com/embed/avatars/{n}      - permanent
    'emoji',         // cdn.discordapp.com/emojis/{id}            - durable until deleted
    'attachment',    // cdn.discordapp.com/attachments/...        - signed, ~24h lifetime
    'mediaProxy',    // media.discordapp.net/...                  - signed too
    'externalProxy', // images-ext-N.discordapp.net/external/...  - wraps a third-party origin
    'twemoji',       // cdn.jsdelivr.net/gh/twitter/twemoji@...   - third-party CDN
    'other',
];

export function decodeEntities(s) {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

export function extractUrls(html) {
    const out = [];
    const re = /https?:\/\/[^"'\s>)]+/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        out.push(decodeEntities(m[0]).replace(/[.,;]+$/, ''));
    }
    return out;
}

export function classifyUrl(url) {
    if (url.includes('cdn.discordapp.com/embed/avatars/')) return 'defaultAvatar';
    if (url.includes('cdn.discordapp.com/avatars/')) return 'avatar';
    if (url.includes('cdn.discordapp.com/emojis/')) return 'emoji';
    if (url.includes('cdn.discordapp.com/attachments/')) return 'attachment';
    if (/images-ext-\d+\.discordapp\.net\/external\//.test(url)) return 'externalProxy';
    if (url.includes('media.discordapp.net/')) return 'mediaProxy';
    if (url.includes('cdn.jsdelivr.net/gh/twitter/twemoji')) return 'twemoji';
    return 'other';
}

// Discord's external proxy embeds the origin it is mirroring:
//   https://images-ext-1.discordapp.net/external/<sig>/https/media.tenor.com/x.mp4
//     -> https://media.tenor.com/x.mp4
// Returns null when the URL is not a proxy link or the origin can't be recovered.
export function proxyOrigin(url) {
    const m = url.match(/^https?:\/\/images-ext-\d+\.discordapp\.net\/external\/[^/]+\/(.+)$/);
    if (!m) return null;
    let rest = m[1];
    // Optional query-ish segment (e.g. "%3Fsize%3D1024") sits before the scheme.
    const schemeAt = rest.search(/(^|\/)https?\//);
    if (schemeAt === -1) return null;
    rest = rest.slice(schemeAt === 0 ? 0 : schemeAt + 1);
    return rest.replace(/^(https?)\//, '$1://');
}

export function parseSignature(url) {
    const get = (k) => {
        const m = url.match(new RegExp('[?&]' + k + '=([0-9a-fA-F]+)'));
        return m ? m[1] : null;
    };
    const ex = get('ex');
    const is = get('is');
    if (!ex) return null;
    return {
        issuedAt: is ? parseInt(is, 16) * 1000 : null,
        expiresAt: parseInt(ex, 16) * 1000,
        signed: true,
    };
}

export function isExpired(url, now) {
    const sig = parseSignature(url);
    if (!sig) return false;
    return sig.expiresAt <= now;
}

export function userIdFromAvatarUrl(url) {
    const m = url.match(/\/avatars\/(\d+)\//);
    return m ? m[1] : null;
}

// Post-migration Discord accounts (no discriminator) map to one of six
// default avatars via (id >> 22) % 6.
export function defaultAvatarIndex(userId) {
    return Number((BigInt(userId) >> 22n) % 6n);
}

export function defaultAvatarUrl(userId) {
    return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex(userId)}.png`;
}

export function avatarUrl(userId, hash, size = 512) {
    if (!hash) return defaultAvatarUrl(userId);
    const ext = hash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${ext}?size=${size}`;
}
