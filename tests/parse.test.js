import { describe, it, expect } from 'vitest';
import { splitGroups, annotateAuthorIds } from '../src/parse.js';

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

describe('annotateAuthorIds', () => {
    function authorEl(html) {
        const root = document.createElement('div');
        root.innerHTML = html;
        annotateAuthorIds(root);
        return root.querySelector('.chatlog__author');
    }

    it('appends the discord id next to the nickname', () => {
        const el = authorEl('<span class="chatlog__author" title="moji" data-user-id="1">^moji</span>');
        expect(el.textContent).toBe('^moji (moji)');
        expect(el.querySelector('.chatlog__author-id').textContent).toBe(' (moji)');
    });

    it('omits the id when it matches the nickname', () => {
        const el = authorEl('<span class="chatlog__author" title="tweaaks">tweaaks</span>');
        expect(el.querySelector('.chatlog__author-id')).toBeNull();
        expect(el.textContent).toBe('tweaaks');
    });

    it('leaves authors without a title untouched', () => {
        const el = authorEl('<span class="chatlog__author">Alice</span>');
        expect(el.querySelector('.chatlog__author-id')).toBeNull();
    });

    it('annotates every author in the batch', () => {
        const root = document.createElement('div');
        root.innerHTML = '<span class="chatlog__author" title="a1">Alice</span>'
            + '<span class="chatlog__author" title="b1">Bob</span>';
        annotateAuthorIds(root);
        expect(root.querySelectorAll('.chatlog__author-id')).toHaveLength(2);
    });

    it('does not annotate twice', () => {
        const root = document.createElement('div');
        root.innerHTML = '<span class="chatlog__author" title="moji">^moji</span>';
        annotateAuthorIds(root);
        annotateAuthorIds(root);
        expect(root.querySelectorAll('.chatlog__author-id')).toHaveLength(1);
        expect(root.querySelector('.chatlog__author').textContent).toBe('^moji (moji)');
    });

    it('keeps the id inside the author span, before the bot tag', () => {
        const root = document.createElement('div');
        root.innerHTML = '<div class="chatlog__header">'
            + '<span class="chatlog__author" title="MEE6#4876">MEE6</span> '
            + '<span class="chatlog__author-tag">BOT</span></div>';
        annotateAuthorIds(root);
        expect(root.textContent.trim()).toBe('MEE6 (MEE6#4876) BOT');
    });
});
