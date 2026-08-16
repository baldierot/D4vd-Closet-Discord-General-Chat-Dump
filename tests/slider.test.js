import { describe, it, expect } from 'vitest';
import {
    indexToPosition, positionToIndex,
    formatRangeLabel,
} from '../src/slider.js';

describe('indexToPosition', () => {
    it('maps first index to 0', () => {
        expect(indexToPosition(0, 100, 800)).toBe(0);
    });

    it('maps last index to track height', () => {
        expect(indexToPosition(99, 100, 800)).toBe(800);
    });

    it('maps middle index to middle', () => {
        expect(indexToPosition(50, 101, 1000)).toBeCloseTo(500);
    });

    it('handles single-item manifest', () => {
        expect(indexToPosition(0, 1, 800)).toBe(0);
    });
});

describe('positionToIndex', () => {
    it('maps 0 to first index', () => {
        expect(positionToIndex(0, 100, 800)).toBe(0);
    });

    it('maps track height to last index', () => {
        expect(positionToIndex(800, 100, 800)).toBe(99);
    });

    it('clamps negative y to 0', () => {
        expect(positionToIndex(-10, 100, 800)).toBe(0);
    });

    it('clamps y beyond track to last index', () => {
        expect(positionToIndex(900, 100, 800)).toBe(99);
    });

    it('rounds to nearest index', () => {
        expect(positionToIndex(400, 101, 1000)).toBe(40);
    });

    it('handles single-item manifest', () => {
        expect(positionToIndex(400, 1, 800)).toBe(0);
    });
});

describe('formatRangeLabel', () => {
    it('formats a date range', () => {
        expect(formatRangeLabel('2023-01-10', '2023-02-15'))
            .toBe('Jan 10, 2023 — Feb 15, 2023');
    });

    it('handles same-day range', () => {
        expect(formatRangeLabel('2023-06-01', '2023-06-01'))
            .toBe('Jun 1, 2023 — Jun 1, 2023');
    });
});
