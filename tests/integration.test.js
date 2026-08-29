import { describe, it, expect, beforeEach } from 'vitest';
import { splitGroups } from '../src/parse.js';
import { formatDateLabel } from '../src/format.js';
import {
    indexToPosition, positionToIndex,
    formatRangeLabel,
} from '../src/slider.js';

const GROUP_MARKER = '<div class=chatlog__message-group>';

function makeGroup(id, author, content) {
    return `${GROUP_MARKER}<div id=chatlog__message-container-${id} class=chatlog__message-container data-message-id=${id}><div class=chatlog__message><div class=chatlog__message-aside></div><div class=chatlog__message-primary><div class=chatlog__header><span class=chatlog__author>${author}</span></div><div class="chatlog__content chatlog__markdown"><span class=chatlog__markdown-preserve>${content}</span></div></div></div></div></div>`;
}

const DAY_HTML = [
    makeGroup(100, 'Alice', 'hello everyone'),
    makeGroup(101, 'Bob', 'hey alice'),
    makeGroup(102, 'Charlie', 'good morning'),
].join('\n');

describe('splitGroups + DOM rendering', () => {
    it('splits HTML and renders message groups', () => {
        const chatlog = document.createElement('div');
        const groups = splitGroups(DAY_HTML);

        expect(groups).toHaveLength(3);

        const temp = document.createElement('div');
        temp.innerHTML = groups.join('');
        while (temp.firstChild) {
            chatlog.appendChild(temp.firstChild);
        }

        expect(chatlog.querySelectorAll('.chatlog__message-group')).toHaveLength(3);
        const containers = chatlog.querySelectorAll('[id^="chatlog__message-container-"]');
        expect(containers).toHaveLength(3);
        expect(containers[0].id).toBe('chatlog__message-container-100');
    });
});

describe('slider ↔ timeline integration', () => {
    it('slider position round-trips through index', () => {
        const count = 1100;
        const trackH = 800;

        for (const idx of [0, 1, 549, 1098, 1099]) {
            const y = indexToPosition(idx, count, trackH);
            const back = positionToIndex(y, count, trackH);
            expect(back).toBe(idx);
        }
    });

    it('range label formats correctly', () => {
        const label = formatRangeLabel('2022-09-06', '2025-09-18');
        expect(label).toBe('Sep 6, 2022 — Sep 18, 2025');
    });
});

describe('batch rendering', () => {
    it('renders groups in batches and tracks progress', () => {
        const chatlog = document.createElement('div');
        const groups = splitGroups(DAY_HTML);
        const BATCH = 2;
        let rendered = 0;

        function renderBatch() {
            if (rendered >= groups.length) return;
            const end = Math.min(rendered + BATCH, groups.length);
            const temp = document.createElement('div');
            temp.innerHTML = groups.slice(rendered, end).join('');
            while (temp.firstChild) chatlog.appendChild(temp.firstChild);
            rendered = end;
        }

        renderBatch();
        expect(rendered).toBe(2);
        expect(chatlog.querySelectorAll('.chatlog__message-group')).toHaveLength(2);

        renderBatch();
        expect(rendered).toBe(3);
        expect(chatlog.querySelectorAll('.chatlog__message-group')).toHaveLength(3);

        renderBatch();
        expect(rendered).toBe(3);
    });
});

describe('date formatting', () => {
    it('formats date label correctly', () => {
        expect(formatDateLabel('2023-01-10')).toBe('Tuesday, January 10, 2023');
    });
});
