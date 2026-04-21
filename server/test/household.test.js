import assert from 'node:assert/strict';
import { addInterval, computeNextDue, isOverdue, sortByDueDate } from '../householdLogic.js';

const day = 24 * 60 * 60 * 1000;

function parseLocal(sd) {
    const [y, m, d] = sd.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
}

// addInterval basics
{
    const base = new Date(2026, 0, 15).getTime();
    assert.equal(addInterval(base, 3, 'days'), base + 3 * day);
    assert.equal(new Date(addInterval(base, 2, 'weeks')).getDate(), 29);
    assert.equal(new Date(addInterval(base, 1, 'months')).getMonth(), 1);
    console.log('OK  addInterval basics');
}

// Leap year: 29 Feb + 12 months = 28 Feb
{
    const leap = new Date(2024, 1, 29).getTime();
    const next = new Date(addInterval(leap, 12, 'months'));
    assert.equal(next.getMonth(), 1);
    assert.equal(next.getDate(), 28);
    console.log('OK  addInterval leap year');
}

// computeNextDue relative days
{
    const anchor = new Date(2026, 3, 1).getTime();
    const task = { recurrence: { mode: 'relative', intervalValue: 10, intervalUnit: 'days' } };
    assert.equal(computeNextDue(task, anchor), anchor + 10 * day);
    console.log('OK  computeNextDue relative days');
}

// computeNextDue relative weeks
{
    const anchor = new Date(2026, 3, 1).getTime();
    const task = { recurrence: { mode: 'relative', intervalValue: 2, intervalUnit: 'weeks' } };
    assert.equal(computeNextDue(task, anchor), anchor + 14 * day);
    console.log('OK  computeNextDue relative weeks');
}

// computeNextDue relative months
{
    const anchor = new Date(2026, 0, 15).getTime();
    const task = { recurrence: { mode: 'relative', intervalValue: 6, intervalUnit: 'months' } };
    const next = new Date(computeNextDue(task, anchor));
    assert.equal(next.getMonth(), 6);
    assert.equal(next.getFullYear(), 2026);
    console.log('OK  computeNextDue relative months');
}

// Absolute: future startDate -> equals startDate
{
    const task = { recurrence: { mode: 'absolute', intervalValue: 1, intervalUnit: 'months', startDate: '2099-06-15' } };
    const result = new Date(computeNextDue(task, Date.now()));
    assert.equal(result.getFullYear(), 2099);
    assert.equal(result.getMonth(), 5);
    assert.equal(result.getDate(), 15);
    console.log('OK  computeNextDue absolute future startDate');
}

// Absolute: past startDate -> next future anchor
{
    const now = Date.now();
    const startMs = now - 100 * day;
    const s = new Date(startMs);
    const startDate = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
    const task = { recurrence: { mode: 'absolute', intervalValue: 30, intervalUnit: 'days', startDate } };
    const next = computeNextDue(task, now);
    assert.ok(next > now);
    const diffDays = Math.round((next - parseLocal(startDate)) / day);
    assert.equal(diffDays % 30, 0);
    console.log('OK  computeNextDue absolute past startDate');
}

// Absolute month-end no drift: startDate = 31 Jan, monthly
{
    const jan31 = new Date(2026, 0, 31).getTime();
    const feb = new Date(addInterval(jan31, 1, 'months'));
    assert.equal(feb.getMonth(), 1);
    assert.equal(feb.getDate(), 28);
    const mar = new Date(addInterval(jan31, 2, 'months'));
    assert.equal(mar.getMonth(), 2);
    assert.equal(mar.getDate(), 31);
    const apr = new Date(addInterval(jan31, 3, 'months'));
    assert.equal(apr.getMonth(), 3);
    assert.equal(apr.getDate(), 30);
    console.log('OK  absolute month-end no drift');
}

// isOverdue boundaries
{
    const now = Date.now();
    assert.equal(isOverdue({ nextDueAt: now - 1 }, now), true);
    assert.equal(isOverdue({ nextDueAt: now }, now), false);
    assert.equal(isOverdue({ nextDueAt: now + 1 }, now), false);
    console.log('OK  isOverdue');
}

// sortByDueDate
{
    const tasks = [
        { id: 'c', nextDueAt: 300 },
        { id: 'a', nextDueAt: 100 },
        { id: 'b', nextDueAt: 200 }
    ];
    const sorted = sortByDueDate(tasks);
    assert.deepEqual(sorted.map(t => t.id), ['a', 'b', 'c']);
    console.log('OK  sortByDueDate');
}

// Invalid intervals throw
{
    assert.throws(() => computeNextDue({ recurrence: { mode: 'relative', intervalValue: 0, intervalUnit: 'days' } }, Date.now()));
    assert.throws(() => computeNextDue({ recurrence: { mode: 'relative', intervalValue: 1.5, intervalUnit: 'days' } }, Date.now()));
    console.log('OK  throws on invalid interval');
}

// Absolute without startDate throws
{
    assert.throws(() => computeNextDue({ recurrence: { mode: 'absolute', intervalValue: 1, intervalUnit: 'months' } }, Date.now()));
    console.log('OK  throws on absolute without startDate');
}

console.log('\nAll household tests passed.');
