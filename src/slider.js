import { MONTH_NAMES } from './format.js';

export function indexToPosition(index, count, trackHeight) {
    if (count <= 1) return 0;
    return (index / (count - 1)) * trackHeight;
}

export function positionToIndex(y, count, trackHeight) {
    if (count <= 1) return 0;
    const index = Math.round((y / trackHeight) * (count - 1));
    return Math.max(0, Math.min(count - 1, index));
}

export function formatRangeLabel(startDate, endDate) {
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const start = `${MONTH_NAMES[sm - 1].slice(0, 3)} ${sd}, ${sy}`;
    const end = `${MONTH_NAMES[em - 1].slice(0, 3)} ${ed}, ${ey}`;
    return `${start} — ${end}`;
}
