import { describe, it, expect } from 'vitest';
import { formatCount, formatDateLabel, MONTH_NAMES, DAY_NAMES } from '../src/format.js';

describe('formatCount', () => {
    it('returns string for numbers under 1000', () => {
        expect(formatCount(0)).toBe('0');
        expect(formatCount(1)).toBe('1');
        expect(formatCount(999)).toBe('999');
    });

    it('formats thousands with k suffix', () => {
        expect(formatCount(1000)).toBe('1k');
        expect(formatCount(1500)).toBe('1.5k');
        expect(formatCount(2300)).toBe('2.3k');
        expect(formatCount(10000)).toBe('10k');
    });

    it('drops trailing .0', () => {
        expect(formatCount(3000)).toBe('3k');
        expect(formatCount(5000)).toBe('5k');
    });

    it('handles large numbers', () => {
        expect(formatCount(100000)).toBe('100k');
        expect(formatCount(1000000)).toBe('1000k');
    });
});

describe('formatDateLabel', () => {
    it('formats a known date correctly', () => {
        expect(formatDateLabel('2023-02-20')).toBe('Monday, February 20, 2023');
    });

    it('formats the first day in the archive', () => {
        expect(formatDateLabel('2022-09-06')).toBe('Tuesday, September 6, 2022');
    });

    it('handles leap day', () => {
        expect(formatDateLabel('2024-02-29')).toBe('Thursday, February 29, 2024');
    });

    it('handles new year', () => {
        expect(formatDateLabel('2025-01-01')).toBe('Wednesday, January 1, 2025');
    });

    it('handles end of year', () => {
        expect(formatDateLabel('2023-12-31')).toBe('Sunday, December 31, 2023');
    });
});

describe('constants', () => {
    it('has 12 month names', () => {
        expect(MONTH_NAMES).toHaveLength(12);
        expect(MONTH_NAMES[0]).toBe('January');
        expect(MONTH_NAMES[11]).toBe('December');
    });

    it('has 7 day names starting with Sunday', () => {
        expect(DAY_NAMES).toHaveLength(7);
        expect(DAY_NAMES[0]).toBe('Sunday');
        expect(DAY_NAMES[6]).toBe('Saturday');
    });
});
