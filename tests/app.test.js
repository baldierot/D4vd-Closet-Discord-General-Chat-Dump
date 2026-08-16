import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

class MockIntersectionObserver {
    constructor(callback) {
        this._callback = callback;
        this._entries = [];
    }
    observe(el) {
        this._entries.push(el);
        setTimeout(() => {
            this._callback(
                [{ target: el, isIntersecting: true }],
                this
            );
        }, 0);
    }
    unobserve() {}
    disconnect() {}
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

const TEST_MANIFEST = [
    { date: '2023-01-10', messageCount: 3, groupCount: 3, htmlSize: 1000, indexSize: 200 },
    { date: '2023-01-11', messageCount: 5, groupCount: 5, htmlSize: 2000, indexSize: 400 },
    { date: '2023-01-12', messageCount: 2, groupCount: 2, htmlSize: 500, indexSize: 100 },
    { date: '2023-02-01', messageCount: 4, groupCount: 4, htmlSize: 800, indexSize: 300 },
];

const GROUP_MARKER = '<div class=chatlog__message-group>';

function makeGroup(id, author, content) {
    return `${GROUP_MARKER}<div id=chatlog__message-container-${id} class=chatlog__message-container data-message-id=${id}><div class=chatlog__message><div class=chatlog__message-aside></div><div class=chatlog__message-primary><div class=chatlog__header><span class=chatlog__author>${author}</span></div><div class="chatlog__content chatlog__markdown"><span class=chatlog__markdown-preserve>${content}</span></div></div></div></div></div>`;
}

function dayHtml(groups) {
    return groups.join('\n');
}

const DAY1_HTML = dayHtml([
    makeGroup(100, 'Alice', 'hello everyone'),
    makeGroup(101, 'Bob', 'hey alice'),
    makeGroup(102, 'Charlie', 'good morning'),
]);
const DAY1_INDEX = [
    { messageId: 'chatlog__message-container-100', author: 'alice', content: 'hello everyone' },
    { messageId: 'chatlog__message-container-101', author: 'bob', content: 'hey alice' },
    { messageId: 'chatlog__message-container-102', author: 'charlie', content: 'good morning' },
];

const DAY2_HTML = dayHtml([
    makeGroup(200, 'Dave', 'whats up'),
    makeGroup(201, 'Eve', 'not much'),
    makeGroup(202, 'Alice', 'hey dave'),
    makeGroup(203, 'Bob', 'alice again'),
    makeGroup(204, 'Charlie', 'hello'),
]);
const DAY2_INDEX = [
    { messageId: 'chatlog__message-container-200', author: 'dave', content: 'whats up' },
    { messageId: 'chatlog__message-container-201', author: 'eve', content: 'not much' },
    { messageId: 'chatlog__message-container-202', author: 'alice', content: 'hey dave' },
    { messageId: 'chatlog__message-container-203', author: 'bob', content: 'alice again' },
    { messageId: 'chatlog__message-container-204', author: 'charlie', content: 'hello' },
];

const SEARCH_META = {
    days: ['2023-01-10', '2023-01-11', '2023-01-12', '2023-02-01'],
    dayOffsets: [0, 3, 8, 10],
    authors: ['alice', 'bob', 'charlie', 'dave', 'eve'],
    displayNames: ['Alice', 'Bob', 'Charlie', 'Dave', 'Eve'],
    chunks: 1,
};
const SEARCH_CHUNK_0 = {
    di: [0,0,0, 1,1,1,1,1, 2,2, 3,3,3,3],
    ai: [0,1,2, 3,4,0,1,2, 0,1, 0,1,2,3],
    dni: [0,1,2, 3,4,0,1,2, 0,1, 0,1,2,3],
    c: [
        'hello everyone','hey alice','good morning',
        'whats up','not much','hey dave','alice again','hello',
        'test msg 1','test msg 2',
        'day4 msg1','day4 msg2','day4 msg3','day4 msg4',
    ],
};

function setupDOM() {
    document.body.innerHTML = `
        <header>
            <div id="range-label">
                <div class="range-date-wrap">
                    <button id="range-start-btn" class="range-date-btn">...</button>
                    <span id="loaded-start-indicator" class="loaded-indicator"></span>
                </div>
                <span class="range-sep">—</span>
                <div class="range-date-wrap">
                    <button id="range-end-btn" class="range-date-btn">...</button>
                    <span id="loaded-end-indicator" class="loaded-indicator"></span>
                </div>
            </div>
            <div id="search-container">
                <input type="text" id="search-input">
                <button id="search-button">Search</button>
            </div>
        </header>
        <div class="app-container">
            <aside id="slider-panel">
                <div id="slider-track">
                    <div id="selected-fill"></div>
                    <div id="loaded-start-mark" class="loaded-mark">
                        <span class="loaded-mark-label"></span>
                    </div>
                    <div id="loaded-end-mark" class="loaded-mark">
                        <span class="loaded-mark-label"></span>
                    </div>
                    <div id="handle-start" class="slider-handle">
                        <span id="handle-start-label" class="handle-label">...</span>
                    </div>
                    <div id="handle-end" class="slider-handle">
                        <span id="handle-end-label" class="handle-label">...</span>
                    </div>
                </div>
                <button id="load-range-btn">Load</button>
                <input type="date" id="picker-start" class="sr-only">
                <input type="date" id="picker-end" class="sr-only">
            </aside>
            <main id="content">
                <div id="timeline"></div>
            </main>
            <div id="search-results" class="hidden">
                <div id="search-results-header">
                    <span id="search-progress"></span>
                    <div id="search-result-filters">
                        <input type="text" id="filter-display" class="result-filter" placeholder="Display name">
                        <input type="text" id="filter-id" class="result-filter" placeholder="ID">
                        <input type="text" id="filter-message" class="result-filter" placeholder="Message">
                    </div>
                    <button id="search-close">✕</button>
                </div>
                <div id="search-pinned-day" class="hidden"></div>
                <div id="search-results-list"></div>
            </div>
        </div>
    `;
}

function mockFetch(responses) {
    return vi.fn((url) => {
        const match = responses.find(r => url.includes(r.url));
        if (!match) {
            return Promise.resolve({ ok: false, status: 404 });
        }
        if (match.json !== undefined) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(match.json),
            });
        }
        if (match.text !== undefined) {
            return Promise.resolve({
                ok: true,
                text: () => Promise.resolve(match.text),
            });
        }
        return Promise.resolve({ ok: false, status: 500 });
    });
}

describe('init()', () => {
    beforeEach(() => {
        vi.resetModules();
        setupDOM();
        window.location.hash = '';
    });

    afterEach(() => {
        vi.restoreAllMocks();
        window.location.hash = '';
    });

    it('fetches manifest and creates day slots for default range', async () => {
        vi.stubGlobal('fetch', mockFetch([
            { url: 'day-manifest.json', json: TEST_MANIFEST },
        ]));

        const { ready } = await import('../script.js');
        await ready;

        const timeline = document.getElementById('timeline');
        const slots = timeline.querySelectorAll('.day-slot');
        expect(slots.length).toBeGreaterThan(0);
        expect(slots.length).toBeLessThanOrEqual(TEST_MANIFEST.length);
    });

    it('shows range label in header', async () => {
        vi.stubGlobal('fetch', mockFetch([
            { url: 'day-manifest.json', json: TEST_MANIFEST },
        ]));

        const { ready } = await import('../script.js');
        await ready;

        const startBtn = document.getElementById('range-start-btn');
        const endBtn = document.getElementById('range-end-btn');
        expect(startBtn.textContent).toMatch(/\w+ \d+, \d{4}/);
        expect(endBtn.textContent).toMatch(/\w+ \d+, \d{4}/);
    });

    it('shows error when manifest fails to load', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))));

        const { ready } = await import('../script.js');
        await ready;

        const timeline = document.getElementById('timeline');
        expect(timeline.textContent).toContain('Failed to load manifest');
    });

    it('creates day headers with formatted dates', async () => {
        vi.stubGlobal('fetch', mockFetch([
            { url: 'day-manifest.json', json: TEST_MANIFEST },
        ]));

        const { ready } = await import('../script.js');
        await ready;

        const headers = document.querySelectorAll('.day-header-date');
        expect(headers.length).toBeGreaterThan(0);
        expect(headers[0].textContent).toMatch(/January|February/);
    });

    it('creates day headers with message counts', async () => {
        vi.stubGlobal('fetch', mockFetch([
            { url: 'day-manifest.json', json: TEST_MANIFEST },
        ]));

        const { ready } = await import('../script.js');
        await ready;

        const counts = document.querySelectorAll('.day-header-count');
        expect(counts.length).toBeGreaterThan(0);
        expect(counts[0].textContent).toContain('messages');
    });
});

describe('hash navigation', () => {
    beforeEach(() => {
        vi.resetModules();
        setupDOM();
        window.location.hash = '';
    });

    afterEach(() => {
        vi.restoreAllMocks();
        window.location.hash = '';
    });

    it('loads range from hash with .. syntax', async () => {
        window.location.hash = '2023-01-10..2023-01-12';

        vi.stubGlobal('fetch', mockFetch([
            { url: 'day-manifest.json', json: TEST_MANIFEST },
        ]));

        const { ready } = await import('../script.js');
        await ready;

        const slots = document.querySelectorAll('.day-slot');
        expect(slots).toHaveLength(3);
        expect(slots[0].dataset.date).toBe('2023-01-10');
        expect(slots[2].dataset.date).toBe('2023-01-12');
    });

    it('centers on single date from hash', async () => {
        window.location.hash = '2023-01-11';

        vi.stubGlobal('fetch', mockFetch([
            { url: 'day-manifest.json', json: TEST_MANIFEST },
        ]));

        const { ready } = await import('../script.js');
        await ready;

        const slots = document.querySelectorAll('.day-slot');
        const dates = Array.from(slots).map(s => s.dataset.date);
        expect(dates).toContain('2023-01-11');
    });
});

describe('day content loading', () => {
    beforeEach(() => {
        vi.resetModules();
        setupDOM();
        window.location.hash = '2023-01-10..2023-01-11';
    });

    afterEach(() => {
        vi.restoreAllMocks();
        window.location.hash = '';
    });

    it('renders message groups when day content is fetched', async () => {
        vi.stubGlobal('fetch', mockFetch([
            { url: 'day-manifest.json', json: TEST_MANIFEST },
            { url: 'days/2023-01-10.html', text: DAY1_HTML },
            { url: 'days/2023-01-11.html', text: DAY2_HTML },
            { url: 'days-search-indexes/2023-01-10.json', json: DAY1_INDEX },
            { url: 'days-search-indexes/2023-01-11.json', json: DAY2_INDEX },
        ]));

        const { ready } = await import('../script.js');
        await ready;

        // Trigger IntersectionObserver manually since happy-dom doesn't support it
        // The observer fires on creation for visible elements, but in test env
        // we may need to wait for async operations
        await vi.waitFor(() => {
            const groups = document.querySelectorAll('.chatlog__message-group');
            expect(groups.length).toBeGreaterThan(0);
        }, { timeout: 3000 });
    });
});

describe('search across all days', () => {
    beforeEach(() => {
        vi.resetModules();
        setupDOM();
        window.location.hash = '2023-01-10..2023-01-11';
    });

    afterEach(() => {
        vi.restoreAllMocks();
        window.location.hash = '';
    });

    it('shows results panel with matches', async () => {
        vi.stubGlobal('fetch', mockFetch([
            { url: 'day-manifest.json', json: TEST_MANIFEST },
            { url: 'search-data-meta.json', json: SEARCH_META },
            { url: 'search-data-0.json', json: SEARCH_CHUNK_0 },
        ]));

        const { ready } = await import('../script.js');
        await ready;

        const searchInput = document.getElementById('search-input');
        const searchButton = document.getElementById('search-button');

        searchInput.value = 'alice';
        searchButton.click();

        await vi.waitFor(() => {
            const results = document.querySelectorAll('.search-result');
            expect(results.length).toBeGreaterThan(0);
        }, { timeout: 3000 });

        const panel = document.getElementById('search-results');
        expect(panel.classList.contains('hidden')).toBe(false);

        const results = document.querySelectorAll('.search-result');
        expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('closes results panel on escape', async () => {
        vi.stubGlobal('fetch', mockFetch([
            { url: 'day-manifest.json', json: TEST_MANIFEST },
            { url: 'search-data-meta.json', json: SEARCH_META },
            { url: 'search-data-0.json', json: SEARCH_CHUNK_0 },
        ]));

        const { ready } = await import('../script.js');
        await ready;

        const searchInput = document.getElementById('search-input');
        searchInput.value = 'alice';
        document.getElementById('search-button').click();

        await vi.waitFor(() => {
            expect(document.querySelectorAll('.search-result').length).toBeGreaterThan(0);
        }, { timeout: 3000 });

        searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', bubbles: true }));

        expect(document.getElementById('search-results').classList.contains('hidden')).toBe(true);
        expect(document.getElementById('content').style.display).not.toBe('none');
    });
});

describe('slider handles', () => {
    beforeEach(() => {
        vi.resetModules();
        setupDOM();
        window.location.hash = '';
    });

    afterEach(() => {
        vi.restoreAllMocks();
        window.location.hash = '';
    });

    it('handle labels show dates', async () => {
        vi.stubGlobal('fetch', mockFetch([
            { url: 'day-manifest.json', json: TEST_MANIFEST },
        ]));

        const { ready } = await import('../script.js');
        await ready;

        const startLabel = document.getElementById('handle-start-label');
        const endLabel = document.getElementById('handle-end-label');
        expect(startLabel.textContent).toMatch(/\d+\/\d+\/\d+/);
        expect(endLabel.textContent).toMatch(/\d+\/\d+\/\d+/);
    });
});
