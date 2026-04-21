import { addDays, addWeeks, addMonths } from 'date-fns';

export function addInterval(dateMs, value, unit) {
    const d = new Date(dateMs);
    switch (unit) {
        case 'days':   return addDays(d, value).getTime();
        case 'weeks':  return addWeeks(d, value).getTime();
        case 'months': return addMonths(d, value).getTime();
        default: throw new Error(`Unknown unit: ${unit}`);
    }
}

function parseStartDateMs(startDate) {
    const [y, m, d] = startDate.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
}

export function computeNextDue(task, anchorMs) {
    const { mode, intervalValue, intervalUnit, startDate } = task.recurrence;
    if (!intervalValue || intervalValue < 1 || !Number.isInteger(intervalValue)) {
        throw new Error('intervalValue must be a positive integer');
    }
    if (mode === 'relative') {
        return addInterval(anchorMs, intervalValue, intervalUnit);
    }
    if (!startDate) throw new Error('absolute mode requires startDate');
    const startMs = parseStartDateMs(startDate);
    const ref = Math.max(anchorMs, Date.now());
    if (startMs > ref) return startMs;
    let k = 1;
    const MAX_K = 10_000;
    while (k < MAX_K) {
        const candidate = addInterval(startMs, k * intervalValue, intervalUnit);
        if (candidate > ref) return candidate;
        k++;
    }
    throw new Error('computeNextDue: exceeded MAX_K iterations');
}

export function isOverdue(task, nowMs) {
    return task.nextDueAt < nowMs;
}

export function sortByDueDate(tasks) {
    return [...tasks].sort((a, b) => a.nextDueAt - b.nextDueAt);
}
