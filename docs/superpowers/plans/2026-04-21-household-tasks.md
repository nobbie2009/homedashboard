# Household Recurring Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone `/household` feature in homedashboard for tracking recurring household/maintenance tasks (Ölwechsel alle 6 Monate, Staub alle 2 Wochen, etc.) with per-task member assignment, relative and absolute recurrence modes, and a 30s undo.

**Architecture:** Pure helper module (`server/householdLogic.js`) for date math via `date-fns`. Three new API endpoints. Server-side normalization hook in the existing `POST /api/config` for `nextDueAt` recomputation. New `/household` React route with flat sorted list, plus a new Admin tab. Independent from Bathroom, Chores, stars.

**Tech Stack:** React 18 + TS + Vite + Tailwind, Node + Express, date-fns `^3.3.1` (already a dep). No new deps.

**Spec:** [2026-04-21-household-tasks-design.md](../specs/2026-04-21-household-tasks-design.md)

---

## File Structure

### Created
- `server/householdLogic.js` — `addInterval`, `computeNextDue`, `isOverdue`, `sortByDueDate`
- `server/test/household.test.js` — standalone node tests
- `src/pages/Household/HouseholdView.tsx` — main page
- `src/pages/Household/TaskCard.tsx` — per-task card
- `src/pages/Household/MemberPicker.tsx` — popup for ≥2 members
- `src/pages/Household/types.ts` — shared TS types
- `src/pages/Admin/HouseholdAdmin.tsx` — admin panel

### Modified
- `server/index.js` — import householdLogic; add 3 endpoints; normalize `nextDueAt` in `POST /api/config`
- `src/contexts/ConfigContext.tsx` — add types, default, merge branch
- `src/App.tsx` — route
- `src/pages/index.tsx` — export
- `src/pages/Admin/AdminSettings.tsx` — tab + mount
- `src/components/layout/MainLayout.tsx` — nav tile

---

## Task 0: `householdLogic.js` + tests

**Files:**
- Create: `server/householdLogic.js`
- Create: `server/test/household.test.js`

- [ ] **Step 1: Write the helper module**

```js
// server/householdLogic.js
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
    // "YYYY-MM-DD" -> local midnight
    const [y, m, d] = startDate.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
}

export function computeNextDue(task, anchorMs) {
    const { mode, intervalValue, intervalUnit, startDate } = task.recurrence;
    if (!intervalValue || intervalValue < 1) {
        throw new Error('intervalValue must be >= 1');
    }
    if (mode === 'relative') {
        return addInterval(anchorMs, intervalValue, intervalUnit);
    }
    // absolute
    if (!startDate) throw new Error('absolute mode requires startDate');
    const startMs = parseStartDateMs(startDate);
    const ref = Math.max(anchorMs, Date.now());
    // Find smallest non-negative k such that addInterval(startMs, k*interval) > ref
    // Each anchor computed from original startMs (NOT iteratively).
    // Short-circuit: if startMs > ref, k=0 is the answer.
    if (startMs > ref) return startMs;
    let k = 1;
    // Guard against runaway loops (1 year of weekly = 52; even decades small)
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
```

- [ ] **Step 2: Write the tests**

```js
// server/test/household.test.js
import assert from 'node:assert/strict';
import { addInterval, computeNextDue, isOverdue, sortByDueDate } from '../householdLogic.js';

const day = 24 * 60 * 60 * 1000;

// addInterval basics
{
    const base = new Date(2026, 0, 15).getTime();
    assert.equal(addInterval(base, 3, 'days'), base + 3 * day);
    assert.equal(new Date(addInterval(base, 2, 'weeks')).getDate(), 29);
    assert.equal(new Date(addInterval(base, 1, 'months')).getMonth(), 1);
    console.log('OK  addInterval basics');
}

// addInterval leap-year: 29 Feb + 1 year = 28 Feb
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
    assert.equal(next.getMonth(), 6); // July
    console.log('OK  computeNextDue relative months');
}

// computeNextDue absolute: startDate in future -> returns startDate
{
    // Use a startDate well in the future to avoid "now" drift in tests
    const future = new Date(2099, 5, 15);
    const startDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    const task = { recurrence: { mode: 'absolute', intervalValue: 1, intervalUnit: 'months', startDate } };
    const result = new Date(computeNextDue(task, Date.now()));
    assert.equal(result.getFullYear(), 2099);
    assert.equal(result.getMonth(), 5);
    assert.equal(result.getDate(), 15);
    console.log('OK  computeNextDue absolute future startDate');
}

// computeNextDue absolute: past startDate -> first future anchor
{
    // Pretend "now" via ref=anchor argument: give an old startDate and a ref in the past too,
    // but Math.max(anchor, Date.now()) means effective ref is Date.now().
    // To test deterministically, patch: pick a startDate 100 days before now
    const now = Date.now();
    const startMs = now - 100 * day;
    const s = new Date(startMs);
    const startDate = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
    const task = { recurrence: { mode: 'absolute', intervalValue: 30, intervalUnit: 'days', startDate } };
    const next = computeNextDue(task, now);
    assert.ok(next > now);
    // Should be exactly startMs + k*30*day for smallest k such that > now
    const diffDays = Math.round((next - parseStartDateMsLocal(startDate)) / day);
    assert.equal(diffDays % 30, 0);
    console.log('OK  computeNextDue absolute past startDate');
}
function parseStartDateMsLocal(sd) {
    const [y, m, d] = sd.split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
}

// Absolute month-end: startDate = 31 Jan, monthly -> 28 Feb (or 29 in leap), 31 Mar, 30 Apr
{
    const task = { recurrence: { mode: 'absolute', intervalValue: 1, intervalUnit: 'months', startDate: '2026-01-31' } };
    const jan31 = new Date(2026, 0, 31).getTime();
    // k=1 anchor
    const feb = new Date(addInterval(jan31, 1, 'months'));
    assert.equal(feb.getMonth(), 1); // Feb
    assert.equal(feb.getDate(), 28); // 2026 not leap
    // k=2 anchor -- still from Jan 31 (not Feb 28)
    const mar = new Date(addInterval(jan31, 2, 'months'));
    assert.equal(mar.getMonth(), 2);
    assert.equal(mar.getDate(), 31);
    // k=3 anchor
    const apr = new Date(addInterval(jan31, 3, 'months'));
    assert.equal(apr.getMonth(), 3);
    assert.equal(apr.getDate(), 30);
    console.log('OK  absolute month-end no drift');
}

// isOverdue
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

// Invalid interval throws
{
    assert.throws(() => computeNextDue({ recurrence: { mode: 'relative', intervalValue: 0, intervalUnit: 'days' } }, Date.now()));
    console.log('OK  throws on invalid interval');
}

// Absolute without startDate throws
{
    assert.throws(() => computeNextDue({ recurrence: { mode: 'absolute', intervalValue: 1, intervalUnit: 'months' } }, Date.now()));
    console.log('OK  throws on absolute without startDate');
}

console.log('\nAll household tests passed.');
```

- [ ] **Step 3: Run tests**

```bash
node server/test/household.test.js
```

Expected: all OK lines + `All household tests passed.`

- [ ] **Step 4: Commit**

```bash
git add server/householdLogic.js server/test/household.test.js
git commit -m "Add household date-math helpers and tests"
```

---

## Task 1: API endpoints + normalization hook

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add import + in-memory undo shadow**

Near the top of `server/index.js`, next to the other imports:

```js
import {
    computeNextDue, sortByDueDate
} from './householdLogic.js';
```

Add a module-level shadow map near other state (after `rewardsData`):

```js
// Household undo shadow: taskId -> { priorNextDueAt, priorLastCompletedAt, priorLastCompletedBy, completedAt }
const householdUndoShadow = new Map();
const UNDO_WINDOW_MS = 30_000;
```

- [ ] **Step 2: Extend `POST /api/config` with household normalization**

Locate the existing handler around `server/index.js:~490`. Currently:

```js
app.post('/api/config', (req, res) => {
    try {
        const newConfig = { ...appConfig, ...req.body };
        appConfig = newConfig;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
        ...
```

Insert the normalization BEFORE the `fs.writeFileSync`:

```js
const newConfig = { ...appConfig, ...req.body };

// Household: recompute nextDueAt for every task (new, edited, or unchanged)
if (newConfig.household?.tasks) {
    for (const t of newConfig.household.tasks) {
        try {
            const anchor = t.lastCompletedAt ?? Date.now();
            t.nextDueAt = computeNextDue(t, anchor);
        } catch (err) {
            console.warn(`[household] normalize failed for task ${t.id}:`, err.message);
            // Leave whatever was there; admin validation should block invalid saves
        }
    }
}

appConfig = newConfig;
fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
```

- [ ] **Step 3: Add the three endpoints**

Add a new route block, just before the bathroom routes (so the section stays together):

```js
// --- HOUSEHOLD ROUTES ---

app.get('/api/household/tasks', (req, res) => {
    const h = appConfig.household || { members: [], tasks: [] };
    res.json({
        tasks: sortByDueDate(h.tasks || []),
        members: h.members || [],
        now: Date.now()
    });
});

app.post('/api/household/complete', (req, res) => {
    const { taskId, memberId } = req.body || {};
    if (!taskId) return res.status(400).json({ error: 'taskId missing' });

    const h = appConfig.household || { members: [], tasks: [] };
    const task = (h.tasks || []).find(t => t.id === taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    // Capture undo shadow BEFORE mutation
    householdUndoShadow.set(task.id, {
        priorNextDueAt: task.nextDueAt,
        priorLastCompletedAt: task.lastCompletedAt,
        priorLastCompletedBy: task.lastCompletedBy,
        completedAt: Date.now()
    });
    // Scheduled cleanup (best-effort; actual expiry enforced on access too)
    setTimeout(() => {
        const s = householdUndoShadow.get(task.id);
        if (s && Date.now() - s.completedAt >= UNDO_WINDOW_MS) {
            householdUndoShadow.delete(task.id);
        }
    }, UNDO_WINDOW_MS + 100);

    const now = Date.now();
    task.lastCompletedAt = now;
    task.lastCompletedBy = memberId || task.assignedTo || null;
    try {
        task.nextDueAt = computeNextDue(task, now);
    } catch (err) {
        return res.status(400).json({ error: `Invalid recurrence: ${err.message}` });
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));

    res.json({ task, completedAt: now });
});

app.post('/api/household/undo', (req, res) => {
    const { taskId } = req.body || {};
    if (!taskId) return res.status(400).json({ error: 'taskId missing' });

    const shadow = householdUndoShadow.get(taskId);
    if (!shadow) return res.status(410).json({ error: 'No recent completion' });
    if (Date.now() - shadow.completedAt > UNDO_WINDOW_MS) {
        householdUndoShadow.delete(taskId);
        return res.status(410).json({ error: 'Undo window expired' });
    }

    const h = appConfig.household || { members: [], tasks: [] };
    const task = (h.tasks || []).find(t => t.id === taskId);
    if (!task) {
        householdUndoShadow.delete(taskId);
        return res.status(404).json({ error: 'Task not found' });
    }

    task.nextDueAt = shadow.priorNextDueAt;
    task.lastCompletedAt = shadow.priorLastCompletedAt;
    task.lastCompletedBy = shadow.priorLastCompletedBy;
    householdUndoShadow.delete(taskId);

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
    res.json({ task });
});
```

- [ ] **Step 4: Syntax check + smoke test**

```bash
node --check server/index.js
```

Expected: no output (= OK).

Start server + check an endpoint:

```bash
npm run server
# In another terminal:
curl -H "x-device-id: <your-id>" http://localhost:3001/api/household/tasks
```

Expected: `{"tasks":[],"members":[],"now":...}` (or with existing data).

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "Add household API endpoints and config normalization"
```

---

## Task 2: ConfigContext types + merge

**Files:**
- Modify: `src/contexts/ConfigContext.tsx`

- [ ] **Step 1: Add type exports**

Insert after the existing `BathroomConfig` interface:

```ts
export interface HouseholdMember {
    id: string;
    name: string;
    color: string;
    photo?: string;
}

export type IntervalUnit = 'days' | 'weeks' | 'months';
export type RecurrenceMode = 'relative' | 'absolute';

export interface HouseholdRecurrence {
    mode: RecurrenceMode;
    intervalValue: number;
    intervalUnit: IntervalUnit;
    startDate?: string;
}

export interface HouseholdTask {
    id: string;
    label: string;
    icon: string;
    description?: string;
    assignedTo?: string;
    recurrence: HouseholdRecurrence;
    nextDueAt: number;
    lastCompletedAt?: number;
    lastCompletedBy?: string;
}

export interface HouseholdConfig {
    members: HouseholdMember[];
    tasks: HouseholdTask[];
}
```

- [ ] **Step 2: Add to `AppConfig`**

Add after the `bathroom?: BathroomConfig;` line:

```ts
household?: HouseholdConfig;
```

- [ ] **Step 3: Add default**

Add after the `bathroom` block in `defaultConfig`:

```ts
household: { members: [], tasks: [] },
```

- [ ] **Step 4: Add merge branch**

Inside the `setConfig(prev => { const merged = {...} })` block, after the `bathroom` branch:

```ts
household: {
    members: data.household?.members || prev.household?.members || [],
    tasks: data.household?.tasks || prev.household?.tasks || []
},
```

- [ ] **Step 5: Commit**

```bash
git add src/contexts/ConfigContext.tsx
git commit -m "Add HouseholdConfig to AppConfig with merge branch"
```

---

## Task 3: HouseholdView + subcomponents

**Files:**
- Create: `src/pages/Household/types.ts`
- Create: `src/pages/Household/TaskCard.tsx`
- Create: `src/pages/Household/MemberPicker.tsx`
- Create: `src/pages/Household/HouseholdView.tsx`

- [ ] **Step 1: Types**

```ts
// src/pages/Household/types.ts
import type { HouseholdMember, HouseholdTask } from '../../contexts/ConfigContext';

export interface HouseholdStateResponse {
    tasks: HouseholdTask[];
    members: HouseholdMember[];
    now: number;
    completedAt?: number;
}

export interface CompleteResponse {
    task: HouseholdTask;
    completedAt: number;
}
```

- [ ] **Step 2: MemberPicker**

```tsx
// src/pages/Household/MemberPicker.tsx
import React from 'react';
import type { HouseholdMember } from '../../contexts/ConfigContext';

interface Props {
    members: HouseholdMember[];
    onPick: (id: string) => void;
    onCancel: () => void;
}

export const MemberPicker: React.FC<Props> = ({ members, onPick, onCancel }) => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
        <div
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4 border border-slate-200 dark:border-slate-700"
            onClick={e => e.stopPropagation()}
        >
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Wer hat es erledigt?</h3>
            <div className="grid grid-cols-2 gap-3">
                {members.map(m => (
                    <button
                        key={m.id}
                        onClick={() => onPick(m.id)}
                        className="flex items-center gap-2 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                        <span className="w-4 h-4 rounded-full" style={{ backgroundColor: m.color }} />
                        <span className="font-semibold text-slate-900 dark:text-white">{m.name}</span>
                    </button>
                ))}
            </div>
            <button
                onClick={onCancel}
                className="mt-4 w-full px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
                Abbrechen
            </button>
        </div>
    </div>
);
```

- [ ] **Step 3: TaskCard**

```tsx
// src/pages/Household/TaskCard.tsx
import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChoreIcon } from '../../components/ChoreIcon';
import type { HouseholdMember, HouseholdTask } from '../../contexts/ConfigContext';

interface Props {
    task: HouseholdTask;
    member: HouseholdMember | undefined;
    lastMember: HouseholdMember | undefined;
    now: number;
    onComplete: () => void;
}

function formatDue(ms: number, now: number): string {
    const diff = ms - now;
    const rel = formatDistanceToNowStrict(ms, { locale: de });
    return diff < 0 ? `überfällig seit ${rel}` : `in ${rel}`;
}

function formatRecurrence(r: HouseholdTask['recurrence']): string {
    const unitLabel = r.intervalUnit === 'days' ? (r.intervalValue === 1 ? 'Tag' : 'Tagen')
        : r.intervalUnit === 'weeks' ? (r.intervalValue === 1 ? 'Woche' : 'Wochen')
        : (r.intervalValue === 1 ? 'Monat' : 'Monaten');
    return `alle ${r.intervalValue} ${unitLabel}`;
}

export const TaskCard: React.FC<Props> = ({ task, member, lastMember, now, onComplete }) => {
    const overdue = task.nextDueAt < now;
    const dueSoon = !overdue && task.nextDueAt - now <= 3 * 24 * 3600 * 1000;
    const borderClass = overdue
        ? 'border-red-500 dark:border-red-600'
        : dueSoon
        ? 'border-yellow-500 dark:border-yellow-600'
        : 'border-slate-300 dark:border-slate-700';

    return (
        <div className={`bg-white dark:bg-slate-800 rounded-xl border-2 ${borderClass} p-4 flex items-center gap-4 shadow-sm`}>
            <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                    {overdue && <AlertTriangle className="w-4 h-4 text-red-500 flex-none" />}
                    <span className="w-3 h-3 rounded-full flex-none" style={{ backgroundColor: member?.color || '#94a3b8' }} title={member?.name || 'Unbekannt'} />
                    <ChoreIcon icon={task.icon} className="w-6 h-6 text-slate-700 dark:text-slate-200 flex-none" />
                    <span className="text-lg font-bold text-slate-900 dark:text-white truncate">{task.label}</span>
                </div>
                <div className={`text-sm ${overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-600 dark:text-slate-300'}`}>
                    {formatDue(task.nextDueAt, now)} · {formatRecurrence(task.recurrence)}
                </div>
                {task.lastCompletedAt && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        Zuletzt: {new Date(task.lastCompletedAt).toLocaleDateString('de-DE')}
                        {lastMember ? ` (${lastMember.name})` : task.lastCompletedBy ? ' (Unbekannt)' : ''}
                    </div>
                )}
            </div>
            <button
                onClick={onComplete}
                className="flex-none bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-semibold active:scale-95 transition"
            >
                <CheckCircle2 className="w-5 h-5" />
                Erledigt
            </button>
        </div>
    );
};
```

- [ ] **Step 4: HouseholdView**

```tsx
// src/pages/Household/HouseholdView.tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSecurity } from '../../contexts/SecurityContext';
import { getApiUrl } from '../../utils/api';
import { Wrench, Undo2 } from 'lucide-react';
import { TaskCard } from './TaskCard';
import { MemberPicker } from './MemberPicker';
import type { HouseholdStateResponse, CompleteResponse } from './types';
import type { HouseholdTask } from '../../contexts/ConfigContext';

const UNDO_MS = 30_000;

const HouseholdView: React.FC = () => {
    const { deviceId } = useSecurity();
    const API_URL = getApiUrl();
    const [data, setData] = useState<HouseholdStateResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [picker, setPicker] = useState<HouseholdTask | null>(null);
    const [undo, setUndo] = useState<{ taskId: string; completedAt: number } | null>(null);
    const [undoRemainingMs, setUndoRemainingMs] = useState(0);
    const undoTimer = useRef<number | null>(null);

    const fetchTasks = useCallback(async () => {
        if (!deviceId) return;
        try {
            const res = await fetch(`${API_URL}/api/household/tasks`, {
                headers: { 'x-device-id': deviceId }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const j: HouseholdStateResponse = await res.json();
            setData(j);
            setError(null);
        } catch {
            setError('Keine Verbindung');
        }
    }, [API_URL, deviceId]);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    useEffect(() => {
        if (!undo) {
            if (undoTimer.current) window.clearInterval(undoTimer.current);
            return;
        }
        const tick = () => {
            const remaining = UNDO_MS - (Date.now() - undo.completedAt);
            if (remaining <= 0) { setUndo(null); setUndoRemainingMs(0); return; }
            setUndoRemainingMs(remaining);
        };
        tick();
        const id = window.setInterval(tick, 250);
        undoTimer.current = id;
        return () => window.clearInterval(id);
    }, [undo]);

    const doComplete = async (task: HouseholdTask, memberId?: string) => {
        try {
            const res = await fetch(`${API_URL}/api/household/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({ taskId: task.id, memberId })
            });
            if (!res.ok) { setError('Fehler'); return; }
            const j: CompleteResponse = await res.json();
            setUndo({ taskId: task.id, completedAt: j.completedAt });
            await fetchTasks();
        } catch {
            setError('Verbindungsfehler');
        }
    };

    const onCardClick = (task: HouseholdTask) => {
        const members = data?.members || [];
        if (members.length <= 1) {
            doComplete(task, members[0]?.id);
        } else {
            setPicker(task);
        }
    };

    const onPickerPick = (memberId: string) => {
        if (!picker) return;
        const task = picker;
        setPicker(null);
        doComplete(task, memberId);
    };

    const doUndo = async () => {
        if (!undo) return;
        try {
            await fetch(`${API_URL}/api/household/undo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({ taskId: undo.taskId })
            });
        } catch {}
        setUndo(null);
        fetchTasks();
    };

    if (!data) {
        return (
            <div className="h-full w-full flex items-center justify-center text-slate-500">
                {error || 'Lädt...'}
            </div>
        );
    }

    const memberById = new Map(data.members.map(m => [m.id, m]));

    return (
        <div className="h-full w-full p-6 bg-white dark:bg-slate-900 overflow-y-auto relative">
            <header className="mb-6 flex items-center gap-3">
                <Wrench className="w-7 h-7 text-blue-500" />
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Haushalt</h1>
            </header>

            {data.tasks.length === 0 ? (
                <div className="text-center text-slate-500 dark:text-slate-400 py-16">
                    <p className="text-lg">Keine Aufgaben konfiguriert</p>
                    <p className="text-sm">Im Admin unter „Haushalt" anlegen.</p>
                </div>
            ) : (
                <div className="space-y-3 max-w-3xl">
                    {data.tasks.map(t => (
                        <TaskCard
                            key={t.id}
                            task={t}
                            member={t.assignedTo ? memberById.get(t.assignedTo) : undefined}
                            lastMember={t.lastCompletedBy ? memberById.get(t.lastCompletedBy) : undefined}
                            now={data.now}
                            onComplete={() => onCardClick(t)}
                        />
                    ))}
                </div>
            )}

            {picker && <MemberPicker members={data.members} onPick={onPickerPick} onCancel={() => setPicker(null)} />}

            {undo && (
                <div className="fixed bottom-24 inset-x-0 flex justify-center pointer-events-none z-40">
                    <button
                        onClick={doUndo}
                        className="pointer-events-auto bg-slate-800 text-white px-5 py-3 rounded-full shadow-lg flex items-center gap-2 border border-slate-700"
                    >
                        <Undo2 className="w-5 h-5" />
                        <span className="font-semibold">Rückgängig</span>
                        <span className="text-slate-400 text-sm tabular-nums">{Math.ceil(undoRemainingMs / 1000)}s</span>
                    </button>
                </div>
            )}

            {error && (
                <div className="fixed top-20 inset-x-0 flex justify-center">
                    <div className="bg-red-900/80 text-red-100 px-4 py-1 rounded text-sm">{error}</div>
                </div>
            )}
        </div>
    );
};

export default HouseholdView;
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/Household
git commit -m "Add HouseholdView with TaskCard, MemberPicker, undo snackbar"
```

---

## Task 4: Wire route + export

**Files:**
- Modify: `src/pages/index.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Export**

Append to `src/pages/index.tsx`:

```ts
export { default as HouseholdView } from './Household/HouseholdView';
```

- [ ] **Step 2: Route**

In `src/App.tsx`, add to imports and routes:

```tsx
import { ..., HouseholdView } from './pages';
// ...
<Route path="household" element={<HouseholdView />} />
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.tsx src/App.tsx
git commit -m "Wire /household route"
```

---

## Task 5: Admin panel

**Files:**
- Create: `src/pages/Admin/HouseholdAdmin.tsx`
- Modify: `src/pages/Admin/AdminSettings.tsx`

- [ ] **Step 1: HouseholdAdmin**

```tsx
// src/pages/Admin/HouseholdAdmin.tsx
import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2 } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import type { HouseholdMember, HouseholdTask, IntervalUnit, RecurrenceMode } from '../../contexts/ConfigContext';

const PRESETS: { label: string; value: number; unit: IntervalUnit }[] = [
    { label: 'Wöchentlich', value: 1, unit: 'weeks' },
    { label: '14-tägig', value: 2, unit: 'weeks' },
    { label: 'Monatlich', value: 1, unit: 'months' },
    { label: 'Vierteljährlich', value: 3, unit: 'months' },
    { label: 'Halbjährlich', value: 6, unit: 'months' },
    { label: 'Jährlich', value: 12, unit: 'months' },
];

export const HouseholdAdmin: React.FC = () => {
    const { config, updateConfig } = useConfig();
    const household = config.household || { members: [], tasks: [] };

    const save = (next: typeof household) => updateConfig({ household: next });

    // --- Members ---
    const addMember = () => {
        const m: HouseholdMember = {
            id: uuidv4(),
            name: 'Neues Mitglied',
            color: '#3b82f6'
        };
        save({ ...household, members: [...household.members, m] });
    };
    const updateMember = (id: string, patch: Partial<HouseholdMember>) => {
        save({ ...household, members: household.members.map(m => m.id === id ? { ...m, ...patch } : m) });
    };
    const deleteMember = (id: string) => {
        save({ ...household, members: household.members.filter(m => m.id !== id) });
    };

    // --- Tasks ---
    const addTask = () => {
        const t: HouseholdTask = {
            id: uuidv4(),
            label: 'Neue Aufgabe',
            icon: 'Check',
            recurrence: { mode: 'relative', intervalValue: 1, intervalUnit: 'weeks' },
            nextDueAt: 0   // server recomputes on save
        };
        save({ ...household, tasks: [...household.tasks, t] });
    };
    const updateTask = (id: string, patch: Partial<HouseholdTask>) => {
        save({
            ...household,
            tasks: household.tasks.map(t => t.id === id ? { ...t, ...patch } : t)
        });
    };
    const updateRecurrence = (id: string, patch: Partial<HouseholdTask['recurrence']>) => {
        save({
            ...household,
            tasks: household.tasks.map(t => t.id === id ? { ...t, recurrence: { ...t.recurrence, ...patch } } : t)
        });
    };
    const deleteTask = (id: string) => {
        save({ ...household, tasks: household.tasks.filter(t => t.id !== id) });
    };

    return (
        <div className="space-y-8 text-slate-900 dark:text-white">
            {/* Members */}
            <section className="bg-slate-200/30 dark:bg-slate-800/30 p-6 rounded-xl border border-slate-300 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Haushaltsmitglieder</h3>
                    <button onClick={addMember} className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm">
                        <Plus className="w-4 h-4" /> Hinzufügen
                    </button>
                </div>
                <div className="space-y-2">
                    {household.members.map(m => (
                        <div key={m.id} className="grid grid-cols-[1fr_6rem_2rem] gap-2 items-center bg-white dark:bg-slate-800 rounded p-2 border border-slate-200 dark:border-slate-700">
                            <input
                                value={m.name}
                                onChange={e => updateMember(m.id, { name: e.target.value })}
                                className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                placeholder="Name"
                            />
                            <input
                                type="color"
                                value={m.color}
                                onChange={e => updateMember(m.id, { color: e.target.value })}
                                className="w-full h-9 rounded border border-slate-300 dark:border-slate-700"
                            />
                            <button onClick={() => deleteMember(m.id)} className="text-red-500 hover:text-red-400 p-2" title="Löschen">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    {household.members.length === 0 && (
                        <div className="text-slate-500 italic text-sm">Noch keine Mitglieder.</div>
                    )}
                </div>
            </section>

            {/* Tasks */}
            <section className="bg-slate-200/30 dark:bg-slate-800/30 p-6 rounded-xl border border-slate-300 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Aufgaben</h3>
                    <button onClick={addTask} className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm">
                        <Plus className="w-4 h-4" /> Hinzufügen
                    </button>
                </div>
                <div className="space-y-4">
                    {household.tasks.map(t => (
                        <div key={t.id} className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700 space-y-2">
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_10rem_10rem_2rem] gap-2">
                                <input
                                    value={t.label}
                                    onChange={e => updateTask(t.id, { label: e.target.value })}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                    placeholder="Bezeichnung"
                                />
                                <input
                                    value={t.icon}
                                    onChange={e => updateTask(t.id, { icon: e.target.value })}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                    placeholder="Icon (z.B. Wrench)"
                                />
                                <select
                                    value={t.assignedTo || ''}
                                    onChange={e => updateTask(t.id, { assignedTo: e.target.value || undefined })}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                >
                                    <option value="">— Zuständig —</option>
                                    {household.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                <button onClick={() => deleteTask(t.id)} className="text-red-500 hover:text-red-400 p-2" title="Löschen">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-[8rem_6rem_8rem_1fr] gap-2 items-center">
                                <select
                                    value={t.recurrence.mode}
                                    onChange={e => updateRecurrence(t.id, { mode: e.target.value as RecurrenceMode })}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                >
                                    <option value="relative">Ab Erledigung</option>
                                    <option value="absolute">Feste Termine</option>
                                </select>
                                <input
                                    type="number"
                                    min={1}
                                    value={t.recurrence.intervalValue}
                                    onChange={e => updateRecurrence(t.id, { intervalValue: Math.max(1, Number(e.target.value) || 1) })}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                />
                                <select
                                    value={t.recurrence.intervalUnit}
                                    onChange={e => updateRecurrence(t.id, { intervalUnit: e.target.value as IntervalUnit })}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                >
                                    <option value="days">Tage</option>
                                    <option value="weeks">Wochen</option>
                                    <option value="months">Monate</option>
                                </select>
                                {t.recurrence.mode === 'absolute' && (
                                    <input
                                        type="date"
                                        value={t.recurrence.startDate || ''}
                                        onChange={e => updateRecurrence(t.id, { startDate: e.target.value })}
                                        className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                    />
                                )}
                            </div>

                            <div className="flex flex-wrap gap-1">
                                {PRESETS.map(p => (
                                    <button
                                        key={p.label}
                                        onClick={() => updateRecurrence(t.id, { intervalValue: p.value, intervalUnit: p.unit })}
                                        className="text-xs px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600"
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>

                            {t.lastCompletedAt && (
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                    Zuletzt erledigt: {new Date(t.lastCompletedAt).toLocaleString('de-DE')}
                                    <button
                                        onClick={() => updateTask(t.id, { lastCompletedAt: undefined, lastCompletedBy: undefined })}
                                        className="ml-2 underline hover:text-slate-700 dark:hover:text-slate-200"
                                    >
                                        zurücksetzen
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                    {household.tasks.length === 0 && (
                        <div className="text-slate-500 italic text-sm">Noch keine Aufgaben.</div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default HouseholdAdmin;
```

- [ ] **Step 2: Mount in AdminSettings**

In `src/pages/Admin/AdminSettings.tsx`:

Add to imports:
```tsx
import HouseholdAdmin from './HouseholdAdmin';
import { Wrench } from 'lucide-react';   // add Wrench to existing lucide import line
```

Add to `tabs` array (after `bad`):
```ts
{ id: 'haushalt', label: 'Haushalt', icon: Wrench },
```

Add the tab rendering block, after the `bad` block:
```tsx
{/* HAUSHALT TAB */}
{activeTab === 'haushalt' && (
    <HouseholdAdmin />
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Admin
git commit -m "Add Haushalt admin panel"
```

---

## Task 6: Nav tile

**Files:**
- Modify: `src/components/layout/MainLayout.tsx`

- [ ] **Step 1: Add import**

Extend existing lucide import with `Wrench`.

- [ ] **Step 2: Add nav item**

Insert into `navItems` array (after `bathroom`):

```ts
{ path: '/household', icon: Wrench, label: 'Haushalt' },
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/MainLayout.tsx
git commit -m "Add Haushalt nav tile"
```

---

## Task 7: Manual end-to-end

- [ ] **Step 1: Start dev + server**

```bash
npm run server
npm run dev
```

- [ ] **Step 2: Verify basics**

- Open `/admin` → new "Haushalt" tab.
- Create member "Papa" (color red).
- Create task "Test-Task", relative, 7 days.
- Go to `/household` → task appears, "fällig in 7 Tagen".

- [ ] **Step 3: Verify complete + undo**

- Click "Erledigt".
- Snackbar appears; click "Rückgängig" within 30 s → task reverts.
- Click "Erledigt" again, wait 35 s → snackbar gone; task now shows "in 7 Tagen".

- [ ] **Step 4: Verify member picker**

- Add a second member "Mama".
- Click "Erledigt" on a task → popup appears → pick "Mama" → card shows "Zuletzt: heute (Mama)".

- [ ] **Step 5: Verify absolute mode**

- Admin: create task "Monatsreport", absolute, 1 month, start = first of this month.
- `/household` → due date = first of NEXT month (since start has already passed for the current cycle).

- [ ] **Step 6: Verify interval edit**

- Admin: change an existing task from 7 days to 14 days.
- `/household` shows updated due date (reflects recomputation on save).

---

## Summary

After all tasks:
- `/household` route with sorted recurring task list, severity coloring, undo.
- Admin "Haushalt" panel: members + tasks CRUD, presets, absolute mode support.
- Server endpoints: GET tasks, POST complete, POST undo.
- Normalization pass in POST /api/config for `nextDueAt`.
- Pure helper module `householdLogic.js` with leap-year and month-end-drift-safe absolute anchoring.
- Standalone integration test script, no new framework.
