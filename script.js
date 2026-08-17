import { formatCount, formatDateLabel } from './src/format.js';
import { splitGroups } from './src/parse.js';
import {
    indexToPosition, positionToIndex,
    formatRangeLabel,
} from './src/slider.js';

const BATCH_SIZE = 50;
const SCROLL_THRESHOLD = 2000;

const content = document.getElementById('content');
const timeline = document.getElementById('timeline');
const sliderTrack = document.getElementById('slider-track');
const handleStart = document.getElementById('handle-start');
const handleEnd = document.getElementById('handle-end');
const selectedFill = document.getElementById('selected-fill');
const loadedStartMark = document.getElementById('loaded-start-mark');
const loadedEndMark = document.getElementById('loaded-end-mark');
const loadBtn = document.getElementById('load-range-btn');
const rangeStartBtn = document.getElementById('range-start-btn');
const rangeEndBtn = document.getElementById('range-end-btn');
const loadedStartIndicator = document.getElementById('loaded-start-indicator');
const loadedEndIndicator = document.getElementById('loaded-end-indicator');
const pickerStart = document.getElementById('picker-start');
const pickerEnd = document.getElementById('picker-end');
const handleStartLabel = document.getElementById('handle-start-label');
const handleEndLabel = document.getElementById('handle-end-label');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');

let manifest = [];
let selectedStartIdx = 0;
let selectedEndIdx = 0;
let loadedStartIdx = -1;
let loadedEndIdx = -1;
let dayStates = new Map();
let loadGeneration = 0;
let currentObserver = null;
let currentScrollHandler = null;
let isDragging = false;
let searchAbort = null;
let searchData = null;
let searchDataPromise = null;

async function init() {
    try {
        manifest = await fetch('day-manifest.json').then(r => r.json());
    } catch {
        timeline.innerHTML = '<div class="center-message"><p>Failed to load manifest.</p></div>';
        return;
    }

    selectedStartIdx = 0;
    selectedEndIdx = Math.min(manifest.length - 1, Math.max(0, Math.round(manifest.length * 0.05) - 1));

    searchDataPromise = loadSearchData();
    searchDataPromise.then(data => { searchData = data; });

    async function loadSearchData() {
        try {
            const meta = await fetch('search-data-meta.json').then(r => r.ok ? r.json() : null);
            if (!meta) return null;
            const chunks = await Promise.all(
                Array.from({ length: meta.chunks }, (_, i) =>
                    fetch(`search-data-${i}.json`).then(r => r.json())
                )
            );
            let totalLen = 0;
            for (const ch of chunks) totalLen += ch.di.length;
            const di = new Array(totalLen);
            const ai = new Array(totalLen);
            const dni = new Array(totalLen);
            const c = new Array(totalLen);
            let off = 0;
            for (const ch of chunks) {
                const n = ch.di.length;
                for (let i = 0; i < n; i++) {
                    di[off + i] = ch.di[i];
                    ai[off + i] = ch.ai[i];
                    dni[off + i] = ch.dni[i];
                    c[off + i] = ch.c[i];
                }
                off += n;
            }
            return { days: meta.days, dayOffsets: meta.dayOffsets, authors: meta.authors, displayNames: meta.displayNames, di, ai, dni, c };
        } catch { return null; }
    }

    loadFromHash();
    setupSlider();
    loadRange();
    setupSearch();

    if (pendingMessage) {
        scrollToLinkedMessage(pendingMessage);
        pendingMessage = null;
    }

    window.addEventListener('hashchange', () => {
        if (loadFromHash()) {
            closeSearchResults();
            loadRange();
            if (pendingMessage) {
                scrollToLinkedMessage(pendingMessage);
                pendingMessage = null;
            }
        }
    });
    window.addEventListener('resize', updateSliderPositions);
    timeline.addEventListener('click', (e) => {
        const container = e.target.closest('.chatlog__message-container');
        if (!container) {
            clearSelectedMessage();
            return;
        }
        const prev = document.querySelector('.search-match');
        if (prev === container) {
            clearSelectedMessage();
        } else {
            if (prev) prev.classList.remove('search-match');
            container.classList.add('search-match');
            setMessageHash(container);
        }
    });
}

let pendingMessage = null;

function loadFromHash() {
    const raw = window.location.hash.substring(1);
    if (!raw) return false;
    const [hash, msgPart] = raw.split('!');
    if (msgPart && msgPart.includes(':')) {
        const [date, id] = msgPart.split(':');
        pendingMessage = { date, id };
    } else {
        pendingMessage = null;
    }
    const parts = hash.split('..');
    if (parts.length === 2) {
        const si = manifest.findIndex(d => d.date === parts[0]);
        const ei = manifest.findIndex(d => d.date === parts[1]);
        if (si >= 0 && ei >= 0 && si <= ei) {
            selectedStartIdx = si;
            selectedEndIdx = ei;
            return true;
        }
    } else {
        const idx = manifest.findIndex(d => d.date === parts[0]);
        if (idx >= 0) {
            selectedStartIdx = Math.max(0, idx - 3);
            selectedEndIdx = Math.min(manifest.length - 1, idx + 3);
            requestAnimationFrame(() => {
                const el = document.querySelector(`.day-slot[data-date="${parts[0]}"]`);
                if (el) el.scrollIntoView({ behavior: 'auto', block: 'start' });
            });
            return true;
        }
    }
    return false;
}

function updateHash() {
    const s = manifest[loadedStartIdx].date;
    const e = manifest[loadedEndIdx].date;
    const newHash = `${s}..${e}`;
    if (window.location.hash.substring(1).split('!')[0] !== newHash) {
        history.replaceState(null, '', '#' + newHash);
    }
}

function setMessageHash(el) {
    const s = manifest[loadedStartIdx].date;
    const e = manifest[loadedEndIdx].date;
    const daySlot = el.closest('.day-slot');
    const date = daySlot ? daySlot.dataset.date : '';
    history.replaceState(null, '', `#${s}..${e}!${date}:${el.id}`);
}

function clearSelectedMessage() {
    const prev = document.querySelector('.search-match');
    if (prev) prev.classList.remove('search-match');
    updateHash();
}

async function scrollToLinkedMessage({ date, id }) {
    const state = dayStates.get(date);
    if (!state) return;

    if (currentObserver) currentObserver.disconnect();

    if (state.state === 'empty' || state.state === 'unloaded') {
        state.state = 'empty';
        await loadDayContent(date, state.gen);
    }

    if (state.state === 'loaded') {
        while (state.renderedCount < state.groups.length) {
            renderDayBatch(state);
            const el = document.getElementById(id);
            if (el) break;
            await new Promise(r => requestAnimationFrame(r));
        }
    }

    const el = document.getElementById(id);
    if (el) {
        el.classList.add('search-match');
        el.scrollIntoView({ behavior: 'auto', block: 'center' });
    }
    reconnectObserver();
}

function setupSlider() {
    updateSliderPositions();

    setupDrag(handleStart, 'start');
    setupDrag(handleEnd, 'end');

    pickerStart.min = manifest[0].date;
    pickerStart.max = manifest[manifest.length - 1].date;
    pickerEnd.min = manifest[0].date;
    pickerEnd.max = manifest[manifest.length - 1].date;

    handleStartLabel.addEventListener('click', (e) => {
        e.stopPropagation();
        pickerStart.value = manifest[selectedStartIdx].date;
        if (pickerStart.showPicker) pickerStart.showPicker();
        else pickerStart.click();
    });
    handleEndLabel.addEventListener('click', (e) => {
        e.stopPropagation();
        pickerEnd.value = manifest[selectedEndIdx].date;
        if (pickerEnd.showPicker) pickerEnd.showPicker();
        else pickerEnd.click();
    });

    pickerStart.addEventListener('change', () => {
        const idx = findClosestIndex(pickerStart.value);
        if (idx >= 0 && idx <= selectedEndIdx) {
            selectedStartIdx = idx;
            updateSliderPositions();
            markPending();
        }
    });
    pickerEnd.addEventListener('change', () => {
        const idx = findClosestIndex(pickerEnd.value);
        if (idx >= 0 && idx >= selectedStartIdx) {
            selectedEndIdx = idx;
            updateSliderPositions();
            markPending();
        }
    });

    rangeStartBtn.addEventListener('click', () => {
        pickerStart.value = manifest[selectedStartIdx].date;
        if (pickerStart.showPicker) pickerStart.showPicker();
        else pickerStart.click();
    });
    rangeEndBtn.addEventListener('click', () => {
        pickerEnd.value = manifest[selectedEndIdx].date;
        if (pickerEnd.showPicker) pickerEnd.showPicker();
        else pickerEnd.click();
    });

    loadBtn.addEventListener('click', () => { closeSearchResults(); loadRange(); });

    const HOVER_THRESHOLD = 12;
    const startMarkLabel = loadedStartMark.querySelector('.loaded-mark-label');
    const endMarkLabel = loadedEndMark.querySelector('.loaded-mark-label');

    sliderTrack.addEventListener('pointermove', (e) => {
        if (loadedStartIdx < 0 || isDragging) {
            startMarkLabel.style.opacity = '0';
            endMarkLabel.style.opacity = '0';
            return;
        }
        const trackRect = sliderTrack.getBoundingClientRect();
        const y = e.clientY - trackRect.top;
        const trackH = trackRect.height;
        const yStart = indexToPosition(loadedStartIdx, manifest.length, trackH);
        const yEnd = indexToPosition(loadedEndIdx, manifest.length, trackH);
        startMarkLabel.style.opacity = Math.abs(y - yStart) < HOVER_THRESHOLD ? '1' : '0';
        endMarkLabel.style.opacity = Math.abs(y - yEnd) < HOVER_THRESHOLD ? '1' : '0';
    });

    sliderTrack.addEventListener('pointerleave', () => {
        startMarkLabel.style.opacity = '0';
        endMarkLabel.style.opacity = '0';
    });
}

function updateSliderPositions() {
    const trackH = sliderTrack.getBoundingClientRect().height;

    const ySelStart = indexToPosition(selectedStartIdx, manifest.length, trackH);
    const ySelEnd = indexToPosition(selectedEndIdx, manifest.length, trackH);
    handleStart.style.top = ySelStart + 'px';
    handleEnd.style.top = ySelEnd + 'px';
    selectedFill.style.top = ySelStart + 'px';
    selectedFill.style.height = (ySelEnd - ySelStart) + 'px';

    if (loadedStartIdx >= 0) {
        const yLoadStart = indexToPosition(loadedStartIdx, manifest.length, trackH);
        const yLoadEnd = indexToPosition(loadedEndIdx, manifest.length, trackH);
        loadedStartMark.style.top = yLoadStart + 'px';
        loadedEndMark.style.top = yLoadEnd + 'px';
        loadedStartMark.style.display = '';
        loadedEndMark.style.display = '';

        const [ls, lm, ld] = manifest[loadedStartIdx].date.split('-').map(Number);
        const [le, lem, led] = manifest[loadedEndIdx].date.split('-').map(Number);
        loadedStartMark.querySelector('.loaded-mark-label').textContent = `${lm}/${ld}/${ls}`;
        loadedEndMark.querySelector('.loaded-mark-label').textContent = `${lem}/${led}/${le}`;
    } else {
        loadedStartMark.style.display = 'none';
        loadedEndMark.style.display = 'none';
    }

    const [sy, sm, sd] = manifest[selectedStartIdx].date.split('-').map(Number);
    const [ey, em, ed] = manifest[selectedEndIdx].date.split('-').map(Number);
    handleStartLabel.textContent = `${sm}/${sd}/${sy}`;
    handleEndLabel.textContent = `${em}/${ed}/${ey}`;

    const startLabel = formatRangeLabel(manifest[selectedStartIdx].date, manifest[selectedStartIdx].date).split(' — ')[0];
    const endLabel = formatRangeLabel(manifest[selectedEndIdx].date, manifest[selectedEndIdx].date).split(' — ')[0];
    rangeStartBtn.textContent = startLabel;
    rangeEndBtn.textContent = endLabel;

    const startChanged = loadedStartIdx >= 0 && selectedStartIdx !== loadedStartIdx;
    const endChanged = loadedEndIdx >= 0 && selectedEndIdx !== loadedEndIdx;

    rangeStartBtn.classList.toggle('pending', startChanged);
    rangeEndBtn.classList.toggle('pending', endChanged);

    if (startChanged) {
        const loadedLabel = formatRangeLabel(manifest[loadedStartIdx].date, manifest[loadedStartIdx].date).split(' — ')[0];
        loadedStartIndicator.textContent = `loaded: ${loadedLabel}`;
    } else {
        loadedStartIndicator.textContent = '';
    }

    if (endChanged) {
        const loadedLabel = formatRangeLabel(manifest[loadedEndIdx].date, manifest[loadedEndIdx].date).split(' — ')[0];
        loadedEndIndicator.textContent = `loaded: ${loadedLabel}`;
    } else {
        loadedEndIndicator.textContent = '';
    }
}

function markPending() {
    const changed = selectedStartIdx !== loadedStartIdx || selectedEndIdx !== loadedEndIdx;
    loadBtn.classList.toggle('pending', changed);
}

function setupDrag(handle, which) {
    let dragging = false;
    let moved = false;

    handle.addEventListener('pointerdown', (e) => {
        dragging = true;
        isDragging = true;
        moved = false;
        handle.setPointerCapture(e.pointerId);
        loadedStartMark.querySelector('.loaded-mark-label').style.opacity = '0';
        loadedEndMark.querySelector('.loaded-mark-label').style.opacity = '0';
        e.preventDefault();
    });

    handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        moved = true;
        const trackRect = sliderTrack.getBoundingClientRect();
        const y = Math.max(0, Math.min(trackRect.height, e.clientY - trackRect.top));
        const idx = positionToIndex(y, manifest.length, trackRect.height);

        if (which === 'start' && idx <= selectedEndIdx) {
            selectedStartIdx = idx;
            updateSliderPositions();
        } else if (which === 'end' && idx >= selectedStartIdx) {
            selectedEndIdx = idx;
            updateSliderPositions();
        }
    });

    handle.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        isDragging = false;
        if (moved) markPending();
    });
}

function findClosestIndex(dateStr) {
    let best = -1;
    let bestDiff = Infinity;
    const target = new Date(dateStr).getTime();
    for (let i = 0; i < manifest.length; i++) {
        const diff = Math.abs(new Date(manifest[i].date).getTime() - target);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = i;
        }
    }
    return best;
}

function loadRange() {
    loadedStartIdx = selectedStartIdx;
    loadedEndIdx = selectedEndIdx;
    loadBtn.classList.remove('pending');

    const gen = ++loadGeneration;
    timeline.innerHTML = '';
    dayStates.clear();
    content.scrollTop = 0;

    updateHash();
    updateSliderPositions();

    for (let i = loadedStartIdx; i <= loadedEndIdx; i++) {
        const day = manifest[i];
        const slot = document.createElement('div');
        slot.className = 'day-slot';
        slot.dataset.date = day.date;
        slot.dataset.index = i;

        const header = document.createElement('div');
        header.className = 'day-header';
        header.innerHTML = `<span class="day-header-date">${formatDateLabel(day.date)}</span>`
            + `<span class="day-header-count">${formatCount(day.messageCount)} messages</span>`;
        slot.appendChild(header);

        const chatlog = document.createElement('div');
        chatlog.className = 'chatlog day-chatlog';
        slot.appendChild(chatlog);

        timeline.appendChild(slot);

        dayStates.set(day.date, {
            index: i,
            el: slot,
            chatlogEl: chatlog,
            state: 'empty',
            groups: null,
            renderedCount: 0,
            gen,
        });
    }

    setupObservers(gen);
}

const MAX_CONCURRENT_LOADS = 3;
const UNLOAD_MARGIN = 5000;
let loadQueue = new Set();
let activeLoads = 0;
let currentGen = 0;
let pendingBatchDays = new Set();
let scrollRafId = null;
let queueDebounceId = null;

function setupObservers(gen) {
    if (currentObserver) currentObserver.disconnect();
    if (currentScrollHandler) content.removeEventListener('scroll', currentScrollHandler);
    loadQueue.clear();
    activeLoads = 0;
    currentGen = gen;
    pendingBatchDays.clear();

    currentObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const date = entry.target.dataset.date;
            if (entry.isIntersecting) {
                const state = dayStates.get(date);
                if (state && state.state === 'empty' && state.gen === currentGen) {
                    loadQueue.add(date);
                }
                if (state && state.state === 'unloaded') {
                    reloadDay(state, currentGen);
                }
            }
        }
        processLoadQueue();
    }, {
        root: content,
        rootMargin: '200% 0px',
    });

    for (const [, state] of dayStates) {
        currentObserver.observe(state.el);
    }

    currentScrollHandler = () => {
        if (scrollRafId) return;
        scrollRafId = requestAnimationFrame(() => {
            scrollRafId = null;
            onScrollFrame();
        });
    };
    content.addEventListener('scroll', currentScrollHandler);
}

let unloadCounter = 0;

function onScrollFrame() {
    const contentRect = content.getBoundingClientRect();

    for (const date of pendingBatchDays) {
        const state = dayStates.get(date);
        if (!state || state.state !== 'loaded' || state.renderedCount >= state.groups.length) {
            pendingBatchDays.delete(date);
            continue;
        }
        const rect = state.chatlogEl.getBoundingClientRect();
        if (rect.bottom < contentRect.bottom + SCROLL_THRESHOLD) {
            renderDayBatch(state);
            if (state.renderedCount >= state.groups.length) {
                pendingBatchDays.delete(date);
            }
        }
    }

    if (++unloadCounter % 10 === 0) {
        unloadDistantDays(contentRect);
    }

    if (!queueDebounceId) {
        queueDebounceId = setTimeout(() => {
            queueDebounceId = null;
            processLoadQueue();
        }, 100);
    }
}

function unloadDistantDays(contentRect) {
    const top = contentRect.top - UNLOAD_MARGIN;
    const bottom = contentRect.bottom + UNLOAD_MARGIN;

    for (const [, state] of dayStates) {
        if (state.state !== 'loaded') continue;
        const rect = state.el.getBoundingClientRect();
        if (rect.bottom < top || rect.top > bottom) {
            state.chatlogEl.innerHTML = '';
            state.groups = null;
            state.renderedCount = 0;
            state.state = 'unloaded';
            pendingBatchDays.delete(state.el.dataset.date);
        }
    }
}

function reloadDay(state, gen) {
    state.state = 'empty';
    state.gen = gen;
    loadQueue.add(state.el.dataset.date);
}

function processLoadQueue() {
    const contentRect = content.getBoundingClientRect();
    const centerY = contentRect.top + contentRect.height / 2;

    const candidates = [...loadQueue]
        .map(date => {
            const state = dayStates.get(date);
            if (!state || state.state !== 'empty' || state.gen !== currentGen) return null;
            const rect = state.el.getBoundingClientRect();
            return { date, dist: Math.abs(rect.top + rect.height / 2 - centerY) };
        })
        .filter(Boolean)
        .sort((a, b) => a.dist - b.dist);

    for (const { date } of candidates) {
        if (activeLoads >= MAX_CONCURRENT_LOADS) break;
        const state = dayStates.get(date);
        if (!state || state.state !== 'empty') continue;
        loadQueue.delete(date);
        activeLoads++;
        loadDayContent(date, currentGen).finally(() => {
            activeLoads--;
            processLoadQueue();
        });
    }
}

async function loadDayContent(date, gen) {
    const state = dayStates.get(date);
    if (!state || state.state !== 'empty') return;
    state.state = 'loading';

    const day = manifest[state.index];

    try {
        const html = await fetch(`days/${day.date}.html`).then(r => {
            if (!r.ok) throw new Error(r.status);
            return r.text();
        });

        if (state.gen !== gen) return;

        state.groups = splitGroups(html);
        state.renderedCount = 0;
        state.state = 'loaded';
        pendingBatchDays.add(date);
        renderDayBatch(state);

    } catch (err) {
        if (state.gen !== gen) return;
        state.chatlogEl.innerHTML =
            `<div class="center-message"><p>Failed to load ${day.date}: ${err.message}</p></div>`;
        state.state = 'error';
    }
}

function renderDayBatch(state) {
    if (state.renderedCount >= state.groups.length) return;

    const end = Math.min(state.renderedCount + BATCH_SIZE, state.groups.length);
    const chunk = state.groups.slice(state.renderedCount, end).join('');

    const temp = document.createElement('div');
    temp.innerHTML = chunk;
    while (temp.firstChild) {
        state.chatlogEl.appendChild(temp.firstChild);
    }
    state.renderedCount = end;

    requestAnimationFrame(() => {
        state.chatlogEl.querySelectorAll('.chatlog__markdown-pre--multiline:not(.hljs)').forEach(el => {
            if (typeof hljs !== 'undefined') hljs.highlightBlock(el);
        });
    });
}

const searchResults = document.getElementById('search-results');
const searchProgress = document.getElementById('search-progress');
const searchResultsList = document.getElementById('search-results-list');
const searchClose = document.getElementById('search-close');
const searchPinnedDay = document.getElementById('search-pinned-day');
const filterDisplay = document.getElementById('filter-display');
const filterId = document.getElementById('filter-id');
const filterMessage = document.getElementById('filter-message');

const VIRT_HEADER_H = 30;
const VIRT_RESULT_H = 50;
const VIRT_BUFFER = 400;
let virtState = null;
let allSearchItems = null;

function setupSearch() {
    searchButton.addEventListener('click', doSearch);
    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') doSearch();
        if (e.key === 'Escape') closeSearchResults();
    });
    searchClose.addEventListener('click', closeSearchResults);
    filterDisplay.addEventListener('input', applyResultFilters);
    filterId.addEventListener('input', applyResultFilters);
    filterMessage.addEventListener('input', applyResultFilters);
}


async function doSearch() {
    const term = searchInput.value.trim();
    if (!term) {
        closeSearchResults();
        return;
    }

    searchResults.classList.remove('hidden');
    content.style.display = 'none';
    searchProgress.textContent = 'Searching...';
    searchResultsList.innerHTML = '<div class="search-loader"><div class="search-spinner"></div></div>';

    if (!searchData) {
        searchProgress.textContent = 'Loading search index...';
        await searchDataPromise;
        if (!searchData) {
            searchProgress.textContent = 'Search index failed to load.';
            searchResultsList.innerHTML = '';
            return;
        }
    }

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const lower = term.toLowerCase();

    const { days, dayOffsets, authors, displayNames, di, ai, dni, c } = searchData;
    const total = di.length;

    const startEntry = dayOffsets[selectedStartIdx];
    const endEntry = selectedEndIdx + 1 < dayOffsets.length
        ? dayOffsets[selectedEndIdx + 1]
        : total;

    const dayMatches = new Map();
    for (let i = startEntry; i < endEntry; i++) {
        const username = authors[ai[i]];
        const dn = displayNames ? displayNames[dni[i]] : username;
        const content = c[i];
        const hitDn = dn.toLowerCase().includes(lower);
        const hitId = username.toLowerCase().includes(lower);
        const hitMsg = content.toLowerCase().includes(lower);
        if (hitDn || hitId || hitMsg) {
            const dayIdx = di[i];
            if (!dayMatches.has(dayIdx)) dayMatches.set(dayIdx, []);
            dayMatches.get(dayIdx).push({ entryIdx: i, displayName: dn, username, content, hitDn, hitId, hitMsg });
        }
    }

    let totalMatches = 0;
    for (const matches of dayMatches.values()) totalMatches += matches.length;

    const sortedDays = [...dayMatches.keys()].sort((a, b) => a - b);

    const items = [];
    for (const dayIdx of sortedDays) {
        const matches = dayMatches.get(dayIdx);
        const date = days[dayIdx];
        items.push({ type: 'header', date, count: matches.length });
        for (const match of matches) {
            items.push({ type: 'result', date, dayIdx, entryIdx: match.entryIdx, displayName: match.displayName, username: match.username, content: match.content, hitDn: match.hitDn, hitId: match.hitId, hitMsg: match.hitMsg });
        }
    }

    allSearchItems = items;
    filterDisplay.value = '';
    filterId.value = '';
    filterMessage.value = '';
    renderSearchItems(items);

    const rangeDays = selectedEndIdx - selectedStartIdx + 1;
    let progressText = `${totalMatches} result${totalMatches === 1 ? '' : 's'} within ${rangeDays}-day range`;
    if (virtState.truncated) {
        progressText += ' ⚠ Too many to display — showing first ~660k, use filters to narrow down';
    }
    searchProgress.textContent = progressText;
}

function renderSearchItems(items) {
    if (virtState) {
        searchResultsList.removeEventListener('scroll', syncSearchView);
        virtState = null;
    }

    const offsets = new Float64Array(items.length + 1);
    const headerOf = new Int32Array(items.length);
    let lastHeader = -1;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type === 'header') lastHeader = i;
        headerOf[i] = lastHeader;
        offsets[i + 1] = offsets[i] + (items[i].type === 'header' ? VIRT_HEADER_H : VIRT_RESULT_H);
    }

    const MAX_SCROLL_H = 33_000_000;
    let totalH = offsets[items.length];
    let truncated = false;
    if (totalH > MAX_SCROLL_H) {
        let cap = items.length;
        for (let i = 0; i < items.length; i++) {
            if (offsets[i + 1] > MAX_SCROLL_H) { cap = i; break; }
        }
        items = items.slice(0, cap);
        totalH = offsets[cap];
        truncated = true;
    }

    searchResultsList.innerHTML = '';
    const spacer = document.createElement('div');
    spacer.style.height = totalH + 'px';
    searchResultsList.appendChild(spacer);

    virtState = { items, offsets, headerOf, spacer, truncated, rendered: { start: -1, end: -1 }, pinnedDate: null };
    searchResultsList.scrollTop = 0;
    syncSearchView();
    searchResultsList.addEventListener('scroll', syncSearchView);
}

function applyResultFilters() {
    if (!allSearchItems) return;
    const dn = filterDisplay.value.trim().toLowerCase();
    const id = filterId.value.trim().toLowerCase();
    const msg = filterMessage.value.trim().toLowerCase();

    if (!dn && !id && !msg) {
        renderSearchItems(allSearchItems);
        return;
    }

    const filtered = [];
    for (const item of allSearchItems) {
        if (item.type === 'header') continue;
        if (dn && !item.displayName.toLowerCase().includes(dn)) continue;
        if (id && !item.username.toLowerCase().includes(id)) continue;
        if (msg && !item.content.toLowerCase().includes(msg)) continue;
        filtered.push(item);
    }

    const byDay = new Map();
    for (const item of filtered) {
        if (!byDay.has(item.date)) byDay.set(item.date, []);
        byDay.get(item.date).push(item);
    }

    const items = [];
    for (const [date, matches] of byDay) {
        items.push({ type: 'header', date, count: matches.length });
        items.push(...matches);
    }

    renderSearchItems(items);
}

function syncSearchView() {
    if (!virtState) return;
    const { items, offsets, headerOf, spacer } = virtState;

    const scrollTop = searchResultsList.scrollTop;
    const viewH = searchResultsList.clientHeight;
    const top = Math.max(0, scrollTop - VIRT_BUFFER);
    const bottom = scrollTop + viewH + VIRT_BUFFER;

    let lo = 0, hi = items.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (offsets[mid + 1] <= top) lo = mid + 1;
        else hi = mid;
    }
    const startIdx = lo;

    lo = startIdx; hi = items.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (offsets[mid] >= bottom) hi = mid - 1;
        else lo = mid;
    }
    const endIdx = lo;

    const hIdx = headerOf[startIdx];
    if (hIdx >= 0) {
        const h = items[hIdx];
        if (h.date !== virtState.pinnedDate) {
            virtState.pinnedDate = h.date;
            searchPinnedDay.textContent = `${formatDateLabel(h.date)} — ${h.count} match${h.count === 1 ? '' : 'es'}`;
            searchPinnedDay.classList.remove('hidden');
        }
    }

    if (startIdx === virtState.rendered.start && endIdx === virtState.rendered.end) return;
    virtState.rendered = { start: startIdx, end: endIdx };

    while (searchResultsList.lastChild !== spacer) {
        searchResultsList.lastChild.remove();
    }

    const frag = document.createDocumentFragment();
    for (let i = startIdx; i <= endIdx; i++) {
        const item = items[i];
        let el;
        if (item.type === 'header') {
            el = document.createElement('div');
            el.className = 'search-day-header search-day-header--virt';
            el.textContent = `${formatDateLabel(item.date)} — ${item.count} match${item.count === 1 ? '' : 'es'}`;
        } else {
            el = document.createElement('div');
            const inLoaded = item.dayIdx >= loadedStartIdx && item.dayIdx <= loadedEndIdx;
            el.className = 'search-result' + (inLoaded ? ' search-result--loaded' : ' search-result--unloaded');

            const authorEl = document.createElement('span');
            authorEl.className = 'search-result-author';
            authorEl.textContent = item.displayName;
            if (item.username !== item.displayName) {
                const idSpan = document.createElement('span');
                idSpan.className = 'search-result-id';
                idSpan.textContent = ' (' + item.username + ')';
                authorEl.appendChild(idSpan);
            }

            const contentEl = document.createElement('span');
            contentEl.className = 'search-result-content';
            contentEl.textContent = item.content.length > 150 ? item.content.slice(0, 150) + '...' : item.content;

            el.appendChild(authorEl);
            el.appendChild(contentEl);
            el.addEventListener('click', () => navigateToEntry(item.date, item.dayIdx, item.entryIdx));
        }
        el.style.position = 'absolute';
        el.style.top = offsets[i] + 'px';
        el.style.left = '0';
        el.style.right = '0';
        frag.appendChild(el);
    }
    searchResultsList.appendChild(frag);
}

async function navigateToEntry(date, dayIdx, entryIdx) {
    const mIdx = manifest.findIndex(d => d.date === date);
    if (mIdx < 0) return;

    if (virtState) {
        searchResultsList.removeEventListener('scroll', syncSearchView);
        virtState = null;
    }
    searchProgress.textContent = `Loading ${formatDateLabel(date)}...`;
    searchResultsList.innerHTML = '<div class="search-loader"><div class="search-spinner"></div></div>';

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const posInDay = entryIdx - searchData.dayOffsets[dayIdx];

    if (currentObserver) currentObserver.disconnect();

    const inRange = mIdx >= loadedStartIdx && mIdx <= loadedEndIdx;
    if (!inRange) {
        loadRange();
        if (currentObserver) currentObserver.disconnect();
    } else {
        const cancelGen = ++loadGeneration;
        currentGen = cancelGen;
        loadQueue.clear();
        activeLoads = 0;
        for (const [, s] of dayStates) {
            s.gen = cancelGen;
        }
    }

    const state = dayStates.get(date);
    if (!state) { closeSearchResults(); return; }

    if (state.state === 'empty' || state.state === 'unloaded') {
        state.state = 'empty';
        await loadDayContent(date, state.gen);
    }

    for (let i = 0; i < 50; i++) {
        if (state.state === 'loaded') break;
        await new Promise(r => setTimeout(r, 100));
    }

    let target = null;

    if (state.state === 'loaded') {
        while (state.renderedCount < state.groups.length) {
            renderDayBatch(state);
            const containers = state.chatlogEl.querySelectorAll('.chatlog__message-container');
            if (containers.length > posInDay) {
                target = containers[posInDay];
                break;
            }
            await new Promise(r => requestAnimationFrame(r));
        }
    }

    if (!target) {
        const containers = state.chatlogEl.querySelectorAll('.chatlog__message-container');
        if (posInDay >= 0 && posInDay < containers.length) {
            target = containers[posInDay];
        }
    }

    if (!target) {
        const dayHeader = state.el.querySelector('.day-header');
        if (dayHeader) target = dayHeader;
    }

    closeSearchResults();
    // Force layout after content becomes visible
    content.offsetHeight;

    if (target) {
        const prev = document.querySelector('.search-match');
        if (prev) prev.classList.remove('search-match');
        target.classList.add('search-match');
        target.scrollIntoView({ behavior: 'auto', block: 'center' });
        if (target.id) setMessageHash(target);
    }

    reconnectObserver();
}

function reconnectObserver() {
    if (currentObserver) {
        for (const [, s] of dayStates) {
            currentObserver.observe(s.el);
        }
    }
}

function closeSearchResults() {
    searchResults.classList.add('hidden');
    content.style.display = '';
    searchProgress.textContent = '';
    searchPinnedDay.classList.add('hidden');
    allSearchItems = null;
    filterDisplay.value = '';
    filterId.value = '';
    filterMessage.value = '';
    if (virtState) {
        searchResultsList.removeEventListener('scroll', syncSearchView);
        virtState = null;
    }
}

export const ready = init();
