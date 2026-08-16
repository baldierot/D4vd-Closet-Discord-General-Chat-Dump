import { describe, it, expect } from 'vitest';
import { filterMessages } from '../src/search.js';

const sampleIndex = [
    { messageId: 'chatlog__message-container-100', author: 'Alice', content: 'hello world' },
    { messageId: 'chatlog__message-container-101', author: 'Bob', content: 'hey alice' },
    { messageId: 'chatlog__message-container-102', author: 'Charlie', content: 'good morning' },
    { messageId: 'chatlog__message-container-103', author: 'Alice', content: 'morning charlie' },
    { messageId: 'chatlog__message-container-104', author: 'Dave', content: '' },
];

describe('filterMessages', () => {
    it('returns empty set for null index', () => {
        const result = filterMessages(null, 'test', 'both');
        expect(result).toBeInstanceOf(Set);
        expect(result.size).toBe(0);
    });

    it('returns empty set for empty term', () => {
        const result = filterMessages(sampleIndex, '', 'both');
        expect(result.size).toBe(0);
    });

    it('returns empty set for empty index', () => {
        const result = filterMessages([], 'hello', 'both');
        expect(result.size).toBe(0);
    });

    it('searches both author and content by default', () => {
        const result = filterMessages(sampleIndex, 'alice', 'both');
        expect(result.size).toBe(3);
        expect(result.has('chatlog__message-container-100')).toBe(true);
        expect(result.has('chatlog__message-container-101')).toBe(true);
        expect(result.has('chatlog__message-container-103')).toBe(true);
    });

    it('searches author only with author filter', () => {
        const result = filterMessages(sampleIndex, 'alice', 'author');
        expect(result.size).toBe(2);
        expect(result.has('chatlog__message-container-100')).toBe(true);
        expect(result.has('chatlog__message-container-103')).toBe(true);
    });

    it('searches content only with content filter', () => {
        const result = filterMessages(sampleIndex, 'alice', 'content');
        expect(result.size).toBe(1);
        expect(result.has('chatlog__message-container-101')).toBe(true);
    });

    it('is case-insensitive', () => {
        const result = filterMessages(sampleIndex, 'HELLO', 'both');
        expect(result.size).toBe(1);
        expect(result.has('chatlog__message-container-100')).toBe(true);
    });

    it('matches partial strings', () => {
        const result = filterMessages(sampleIndex, 'morn', 'content');
        expect(result.size).toBe(2);
    });

    it('handles messages with empty content', () => {
        const result = filterMessages(sampleIndex, 'dave', 'author');
        expect(result.size).toBe(1);
        expect(result.has('chatlog__message-container-104')).toBe(true);
    });

    it('returns no matches for non-existent term', () => {
        const result = filterMessages(sampleIndex, 'zzzznotfound', 'both');
        expect(result.size).toBe(0);
    });
});
