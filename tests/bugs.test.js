import { describe, it, expect } from 'vitest';

describe('search range boundary (bug 3)', () => {
    it('endEntry includes last day entries when selectedEndIdx is last manifest day', () => {
        const dayOffsets = [0, 3, 8, 10];
        const total = 14;

        const selectedStartIdx = 0;
        const selectedEndIdx = 3; // last day (index 3)

        const startEntry = dayOffsets[selectedStartIdx];
        const endEntry = selectedEndIdx + 1 < dayOffsets.length
            ? dayOffsets[selectedEndIdx + 1]
            : total;

        expect(startEntry).toBe(0);
        expect(endEntry).toBe(14); // should include all 14 entries
    });

    it('endEntry uses next dayOffset when not the last day', () => {
        const dayOffsets = [0, 3, 8, 10];
        const total = 14;

        const selectedStartIdx = 1;
        const selectedEndIdx = 2; // middle day

        const startEntry = dayOffsets[selectedStartIdx];
        const endEntry = selectedEndIdx + 1 < dayOffsets.length
            ? dayOffsets[selectedEndIdx + 1]
            : total;

        expect(startEntry).toBe(3);
        expect(endEntry).toBe(10); // entries for days 1 and 2
    });

    it('single day range works', () => {
        const dayOffsets = [0, 3, 8, 10];
        const total = 14;

        const selectedStartIdx = 1;
        const selectedEndIdx = 1;

        const startEntry = dayOffsets[selectedStartIdx];
        const endEntry = selectedEndIdx + 1 < dayOffsets.length
            ? dayOffsets[selectedEndIdx + 1]
            : total;

        expect(startEntry).toBe(3);
        expect(endEntry).toBe(8); // 5 entries for day 1
    });
});

describe('navigateToEntry position calculation (bug 5)', () => {
    it('correctly maps global entryIdx to position within day', () => {
        const dayOffsets = [0, 3, 8, 10];

        // Entry 0 is position 0 in day 0
        expect(0 - dayOffsets[0]).toBe(0);
        // Entry 2 is position 2 in day 0
        expect(2 - dayOffsets[0]).toBe(2);
        // Entry 3 is position 0 in day 1
        expect(3 - dayOffsets[1]).toBe(0);
        // Entry 7 is position 4 in day 1
        expect(7 - dayOffsets[1]).toBe(4);
        // Entry 10 is position 0 in day 3
        expect(10 - dayOffsets[3]).toBe(0);
        // Entry 13 is position 3 in day 3
        expect(13 - dayOffsets[3]).toBe(3);
    });

    it('posInDay maps to correct per-day index entry', () => {
        const dayOffsets = [0, 3, 8, 10];
        const perDayIndex = [
            { messageId: 'chatlog__message-container-200', author: 'dave', content: 'whats up' },
            { messageId: 'chatlog__message-container-201', author: 'eve', content: 'not much' },
            { messageId: 'chatlog__message-container-202', author: 'alice', content: 'hey dave' },
            { messageId: 'chatlog__message-container-203', author: 'bob', content: 'alice again' },
            { messageId: 'chatlog__message-container-204', author: 'charlie', content: 'hello' },
        ];

        // Day 1 has entries at global indices 3-7
        // Global entry 5 = position 2 in day 1
        const entryIdx = 5;
        const dayIdx = 1;
        const posInDay = entryIdx - dayOffsets[dayIdx];
        expect(posInDay).toBe(2);
        expect(perDayIndex[posInDay].messageId).toBe('chatlog__message-container-202');
        expect(perDayIndex[posInDay].author).toBe('alice');
    });
});

describe('highlightTerm multiple occurrences (bug 4)', () => {
    function escapeHtml(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function highlightTerm(text, lower) {
        let result = '';
        let remaining = text;
        while (remaining.length > 0) {
            const idx = remaining.toLowerCase().indexOf(lower);
            if (idx === -1) { result += escapeHtml(remaining); break; }
            result += escapeHtml(remaining.slice(0, idx))
                + '<mark>' + escapeHtml(remaining.slice(idx, idx + lower.length)) + '</mark>';
            remaining = remaining.slice(idx + lower.length);
        }
        return result;
    }

    it('highlights all occurrences', () => {
        const result = highlightTerm('d4vd vs d4vd', 'd4vd');
        expect(result).toBe('<mark>d4vd</mark> vs <mark>d4vd</mark>');
    });

    it('highlights single occurrence', () => {
        const result = highlightTerm('hello d4vd world', 'd4vd');
        expect(result).toBe('hello <mark>d4vd</mark> world');
    });

    it('returns escaped text when no match', () => {
        const result = highlightTerm('hello world', 'xyz');
        expect(result).toBe('hello world');
    });

    it('escapes html in highlighted text', () => {
        const result = highlightTerm('<d4vd>', 'd4vd');
        expect(result).toBe('&lt;<mark>d4vd</mark>&gt;');
    });

    it('handles case-insensitive matching', () => {
        const result = highlightTerm('D4VD and d4vd', 'd4vd');
        expect(result).toBe('<mark>D4VD</mark> and <mark>d4vd</mark>');
    });
});
