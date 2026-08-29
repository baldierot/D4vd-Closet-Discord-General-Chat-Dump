// Races at the load-generation seam.
//
// These live in their own file on purpose. vi.resetModules() leaves earlier
// script.js instances alive with pending observers and scroll handlers, and
// they keep calling whatever global fetch is currently stubbed - which makes
// any measurement of concurrent fetches meaningless in a shared file.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

class MockIntersectionObserver {
    constructor(cb) { this._cb = cb; }
    observe(el) { setTimeout(() => this._cb([{ target: el, isIntersecting: true }], this), 0); }
    unobserve() {}
    disconnect() {}
}
vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

const BODY = fs.readFileSync('index.html', 'utf8')
    .replace(/[\s\S]*<body>/, '')
    .replace(/<\/body>[\s\S]*/, '')
    .replace(/<script[\s\S]*?<\/script>/g, '');

function setupDOM() {
    document.body.innerHTML = BODY;
}

function group(id, author, content) {
    return `<div class=chatlog__message-group><div id=chatlog__message-container-${id} `
        + `class=chatlog__message-container data-message-id=${id}><div class=chatlog__message>`
        + `<div class=chatlog__message-primary><div class=chatlog__header>`
        + `<span class=chatlog__author title=${author}>${author}</span></div>`
        + `<div class="chatlog__content chatlog__markdown">`
        + `<span class=chatlog__markdown-preserve>${content}</span></div></div></div></div></div>`;
}

const DAY_HTML = [group(1, 'alice', 'hello everyone'), group(2, 'bob', 'hey')].join('\n');

describe('a superseded load must not strand the day', () => {
    const MANIFEST = [
        { date: '2023-01-10', messageCount: 2 },
        { date: '2023-01-11', messageCount: 2 },
    ];
    const META = {
        days: ['2023-01-10', '2023-01-11'],
        dayOffsets: [0, 2],
        authors: ['alice', 'bob'],
        displayNames: ['alice', 'bob'],
        chunks: 1,
    };
    const CHUNK = { di: [0, 0, 1, 1], ai: [0, 1, 0, 1], dni: [0, 1, 0, 1], c: ['hello everyone', 'hey', 'x', 'y'] };

    beforeEach(() => { vi.resetModules(); setupDOM(); window.location.hash = '2023-01-10..2023-01-11'; });
    afterEach(() => { vi.restoreAllMocks(); window.location.hash = ''; });

    it('re-queues a day whose generation was bumped mid-flight', async () => {
        let release;
        const gate = new Promise((r) => { release = r; });
        let dayRequests = 0;

        vi.stubGlobal('fetch', vi.fn(async (url) => {
            if (url.includes('day-manifest')) return { ok: true, json: async () => MANIFEST };
            if (url.includes('search-data-meta')) return { ok: true, json: async () => META };
            if (url.includes('search-data-0')) return { ok: true, json: async () => CHUNK };
            if (url.includes('2023-01-10.html')) {
                dayRequests++;
                if (dayRequests === 1) await gate;      // hold the first attempt open
                return { ok: true, text: async () => DAY_HTML };
            }
            if (url.includes('.html')) return { ok: true, text: async () => DAY_HTML };
            return { ok: false, status: 404 };
        }));

        const { ready } = await import('../script.js');
        await ready;
        await vi.waitFor(() => expect(dayRequests).toBe(1), { timeout: 3000 });

        // Clicking a search result bumps state.gen on every day, superseding the
        // in-flight load for 2023-01-10.
        document.getElementById('search-input').value = 'hello everyone';
        document.getElementById('search-button').click();
        await vi.waitFor(() => {
            expect(document.querySelectorAll('.search-result').length).toBeGreaterThan(0);
        }, { timeout: 4000 });
        document.querySelector('.search-result').click();

        // navigateToEntry awaits two animation frames before it bumps the
        // generation; release the held fetch only after that has happened,
        // otherwise the load completes while generations still match and the
        // race under test never occurs.
        await new Promise((r) => setTimeout(r, 250));
        release();

        const slot = document.querySelector('.day-slot[data-date="2023-01-10"]');
        await vi.waitFor(() => {
            expect(slot.querySelectorAll('.chatlog__message-group').length).toBeGreaterThan(0);
        }, { timeout: 8000 });

        // retried rather than left on 'loading' forever
        expect(dayRequests).toBeGreaterThanOrEqual(2);
    }, 20000);
});

describe('concurrency throttle survives a range change', () => {
    const MANIFEST = Array.from({ length: 12 }, (_, i) => ({
        date: `2023-02-${String(i + 1).padStart(2, '0')}`,
        messageCount: 2,
    }));

    beforeEach(() => { vi.resetModules(); setupDOM(); window.location.hash = '2023-02-01..2023-02-12'; });
    afterEach(() => { vi.restoreAllMocks(); window.location.hash = ''; });

    it('never exceeds MAX_CONCURRENT_LOADS, even after the range is reloaded', async () => {
        let outstanding = 0;
        let peak = 0;
        const releases = [];

        vi.stubGlobal('fetch', vi.fn(async (url) => {
            if (url.includes('day-manifest')) return { ok: true, json: async () => MANIFEST };
            if (url.includes('search-data')) return { ok: false, status: 404 };
            if (url.includes('.html')) {
                outstanding++;
                peak = Math.max(peak, outstanding);
                await new Promise((r) => releases.push(r));
                outstanding--;
                return { ok: true, text: async () => DAY_HTML };
            }
            return { ok: false, status: 404 };
        }));

        const { ready } = await import('../script.js');
        await ready;
        await vi.waitFor(() => expect(outstanding).toBeGreaterThan(0), { timeout: 3000 });
        expect(peak).toBeLessThanOrEqual(3);

        // Reload the range while loads are open, then let the old ones settle.
        document.getElementById('load-range-btn').click();
        await new Promise((r) => setTimeout(r, 50));
        releases.splice(0).forEach((r) => r());
        await new Promise((r) => setTimeout(r, 300));

        // Zeroing activeLoads under those pending finallys would drive it
        // negative and let the throttle run well past 3.
        expect(peak).toBeLessThanOrEqual(3);
    }, 20000);
});
