import { describe, it, expect } from 'vitest';
import {
    classifyUrl, extractUrls, decodeEntities, proxyOrigin,
    parseSignature, isExpired, defaultAvatarIndex, defaultAvatarUrl,
    avatarUrl, userIdFromAvatarUrl,
} from '../src/assets.js';

describe('classifyUrl', () => {
    const cases = [
        ['https://cdn.discordapp.com/avatars/123/abc.png?size=512', 'avatar'],
        ['https://cdn.discordapp.com/embed/avatars/3.png', 'defaultAvatar'],
        ['https://cdn.discordapp.com/emojis/802267228011102228.gif', 'emoji'],
        ['https://cdn.discordapp.com/attachments/1/2/x.jpg?ex=1&is=2&hm=3', 'attachment'],
        ['https://media.discordapp.net/attachments/1/2/x.png', 'mediaProxy'],
        ['https://images-ext-1.discordapp.net/external/sig/https/media.tenor.com/a.mp4', 'externalProxy'],
        ['https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/1f62d.svg', 'twemoji'],
        ['https://open.spotify.com/track/abc', 'other'],
    ];
    for (const [url, cls] of cases) {
        it(`classifies ${cls}`, () => expect(classifyUrl(url)).toBe(cls));
    }

    it('does not confuse default avatars with user avatars', () => {
        expect(classifyUrl('https://cdn.discordapp.com/embed/avatars/1.png')).toBe('defaultAvatar');
    });
});

describe('decodeEntities / extractUrls', () => {
    it('decodes ampersand entities', () => {
        expect(decodeEntities('a?ex=1&amp;is=2')).toBe('a?ex=1&is=2');
    });

    it('extracts and decodes urls from html', () => {
        const html = '<img src="https://cdn.discordapp.com/attachments/1/2/x.jpg?ex=68cda05c&amp;is=68cc4edc">';
        const urls = extractUrls(html);
        expect(urls).toHaveLength(1);
        expect(urls[0]).toContain('&is=');
        expect(urls[0]).not.toContain('&amp;');
    });

    it('strips trailing punctuation', () => {
        expect(extractUrls('see https://example.com/a.png, ok')[0]).toBe('https://example.com/a.png');
    });

    it('returns empty array when there are no urls', () => {
        expect(extractUrls('<div>nothing</div>')).toEqual([]);
    });
});

describe('proxyOrigin', () => {
    it('recovers the wrapped origin', () => {
        const px = 'https://images-ext-1.discordapp.net/external/yKw1SR/https/media.tenor.com/DjYn/drippy.mp4';
        expect(proxyOrigin(px)).toBe('https://media.tenor.com/DjYn/drippy.mp4');
    });

    it('handles an encoded query segment before the scheme', () => {
        const px = 'https://images-ext-1.discordapp.net/external/sig/%3Fsize%3D1024/https/cdn.discordapp.com/avatars/1/a.png';
        expect(proxyOrigin(px)).toBe('https://cdn.discordapp.com/avatars/1/a.png');
    });

    it('returns null for non-proxy urls', () => {
        expect(proxyOrigin('https://cdn.discordapp.com/emojis/1.png')).toBeNull();
    });
});

describe('parseSignature / isExpired', () => {
    // ex=68cda05c -> 2025-09-19T18:26:36Z, is=68cc4edc -> 24h earlier
    const signed = 'https://cdn.discordapp.com/attachments/1/2/x.jpg?ex=68cda05c&is=68cc4edc&hm=deadbeef';

    it('parses issued and expiry timestamps', () => {
        const sig = parseSignature(signed);
        expect(sig.signed).toBe(true);
        expect(sig.expiresAt - sig.issuedAt).toBe(24 * 3600 * 1000);
    });

    it('returns null for unsigned urls', () => {
        expect(parseSignature('https://cdn.discordapp.com/emojis/1.png')).toBeNull();
    });

    it('reports expiry relative to now', () => {
        const sig = parseSignature(signed);
        expect(isExpired(signed, sig.expiresAt + 1)).toBe(true);
        expect(isExpired(signed, sig.expiresAt - 1)).toBe(false);
    });

    it('treats unsigned urls as never expiring', () => {
        expect(isExpired('https://cdn.discordapp.com/emojis/1.png', Date.now())).toBe(false);
    });
});

describe('avatar helpers', () => {
    it('extracts the user id from an avatar url', () => {
        expect(userIdFromAvatarUrl('https://cdn.discordapp.com/avatars/342852097831862284/ab.png'))
            .toBe('342852097831862284');
    });

    it('computes a default avatar index in range', () => {
        for (const id of ['342852097831862284', '531624015828090890', '1000162022736007238']) {
            const i = defaultAvatarIndex(id);
            expect(i).toBeGreaterThanOrEqual(0);
            expect(i).toBeLessThan(6);
        }
    });

    it('is deterministic for a given id', () => {
        expect(defaultAvatarIndex('342852097831862284')).toBe(defaultAvatarIndex('342852097831862284'));
    });

    it('builds a default avatar url', () => {
        expect(defaultAvatarUrl('342852097831862284')).toMatch(/embed\/avatars\/[0-5]\.png$/);
    });

    it('falls back to the default avatar when the hash is missing', () => {
        expect(avatarUrl('342852097831862284', null)).toContain('embed/avatars/');
    });

    it('uses gif for animated hashes', () => {
        expect(avatarUrl('1', 'a_abc')).toContain('.gif');
        expect(avatarUrl('1', 'abc')).toContain('.png');
    });
});
