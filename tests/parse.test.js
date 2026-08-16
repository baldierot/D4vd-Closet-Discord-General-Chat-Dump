import { describe, it, expect } from 'vitest';
import { splitGroups } from '../src/parse.js';

describe('splitGroups', () => {
    const marker = '<div class=chatlog__message-group>';

    it('returns empty array for empty string', () => {
        expect(splitGroups('')).toEqual([]);
    });

    it('returns empty array for HTML with no message groups', () => {
        expect(splitGroups('<div>no groups here</div>')).toEqual([]);
    });

    it('parses a single group', () => {
        const html = `${marker}<div>content</div></div>`;
        const result = splitGroups(html);
        expect(result).toHaveLength(1);
        expect(result[0]).toContain(marker);
        expect(result[0]).toContain('content');
    });

    it('parses multiple groups', () => {
        const html = `${marker}first</div>${marker}second</div>${marker}third</div>`;
        const result = splitGroups(html);
        expect(result).toHaveLength(3);
        expect(result[0]).toContain('first');
        expect(result[1]).toContain('second');
        expect(result[2]).toContain('third');
    });

    it('discards content before the first marker', () => {
        const html = `<html><body>preamble${marker}actual content</div>`;
        const result = splitGroups(html);
        expect(result).toHaveLength(1);
        expect(result[0]).not.toContain('preamble');
        expect(result[0]).toContain('actual content');
    });

    it('preserves the marker in each group', () => {
        const html = `${marker}one</div>${marker}two</div>`;
        const result = splitGroups(html);
        result.forEach(group => {
            expect(group.startsWith(marker)).toBe(true);
        });
    });

    it('handles real-world message structure', () => {
        const html = `${marker}<div id=chatlog__message-container-123 class=chatlog__message-container data-message-id=123><div class=chatlog__message><div class=chatlog__message-aside></div><div class=chatlog__message-primary><div class=chatlog__header><span class=chatlog__author>user</span></div><div class="chatlog__content chatlog__markdown"><span class=chatlog__markdown-preserve>hello</span></div></div></div></div></div>`;
        const result = splitGroups(html);
        expect(result).toHaveLength(1);
        expect(result[0]).toContain('data-message-id=123');
        expect(result[0]).toContain('hello');
    });
});
