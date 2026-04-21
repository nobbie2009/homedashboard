# Bathroom Echo Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a touch-friendly bathroom routine checklist served by homedashboard at `/bathroom`, optimized for Echo Show 5, with optional star-reward integration to the existing Chores system.

**Architecture:** New React route + admin section + two new Express endpoints. Separate runtime state file (`server/data/bathroom-state.json`). Shared star-grant helpers extracted from existing inline code in `server/index.js`. Device-gate auth reused. No new tooling/framework.

**Tech Stack:** React 18 + Vite + TypeScript + TailwindCSS (frontend), Node + Express (backend), JSON-file storage. Lucide icons. No test framework — integration test runs as standalone node script.

**Spec:** [2026-04-21-bathroom-echo-design.md](../specs/2026-04-21-bathroom-echo-design.md)

---

## File Structure

### Created
- `server/choreLogic.js` — gains two new exports: `grantChoreStars`, `revokeChoreStars`
- `server/bathroomState.js` — state loader/saver + window-transition logic
- `server/test/bathroom.test.js` — manual integration test script
- `src/pages/Bathroom/BathroomView.tsx` — Echo-facing main view
- `src/pages/Bathroom/ActiveWindowList.tsx` — the checklist component
- `src/pages/Bathroom/ClockScreen.tsx` — outside-window state
- `src/pages/Bathroom/SuccessScreen.tsx` — all-done state
- `src/pages/Bathroom/types.ts` — shared TypeScript types
- `src/pages/Admin/BathroomAdmin.tsx` — new admin panel
- `docs/superpowers/plans/2026-04-21-bathroom-echo-music-assistant-prompt.md` — Claude-Code prompt for the music-assistant-pwa repo

### Modified
- `server/index.js` — refactor `/api/rewards/complete` to use new helper; add 3 new bathroom endpoints
- `src/contexts/ConfigContext.tsx` — add `BathroomConfig` to `AppConfig`, extend merge block
- `src/App.tsx` — add `/bathroom` route
- `src/pages/index.tsx` — export `BathroomView`
- `src/pages/Admin/AdminSettings.tsx` — mount the new `BathroomAdmin` panel
- `src/components/layout/MainLayout.tsx` — optional nav tile (see Task 9)

---

## Task 0: Refactor star-grant into shared helpers

**Why first:** the bathroom endpoints reuse this helper. Without the refactor they can't work.

**Files:**
- Modify: `server/choreLogic.js` — add two exports
- Modify: `server/index.js:703-745` — rewrite route to call helper

- [ ] **Step 1: Add `grantChoreStars` export to `server/choreLogic.js`**

Append to the end of the file:

```js
/**
 * Grants stars for a completed chore. Pure function operating on passed-in
 * state objects (appConfig, rewardsData). Mutates both. Throws on invalid
 * task/kid. Used by both the legacy /api/rewards/complete route (after
 * PIN check) and the new bathroom endpoints (no PIN, server-enforced
 * once-per-window).
 *
 * @param {object} appConfig
 * @param {object} rewardsData
 * @param {{taskId: string, kidId: string, source: 'chore'|'bathroom'}} opts
 * @returns {{entry: object, rewards: object}}
 */
export function grantChoreStars(appConfig, rewardsData, { taskId, kidId, source }) {
    const task = appConfig.chores?.tasks?.find(t => t.id === taskId);
    const kid = appConfig.chores?.kids?.find(k => k.id === kidId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (!kid) throw new Error(`Kid not found: ${kidId}`);

    const stars = task.difficulty || 1;
    const mode = appConfig.rewards?.mode || 'individual';

    const entry = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        taskId: task.id,
        taskLabel: task.label,
        kidId: kid.id,
        kidName: kid.name,
        stars,
        timestamp: Date.now(),
        source: source || 'chore',
        mode
    };
    rewardsData.completions.push(entry);

    if (!appConfig.rewards) {
        appConfig.rewards = { mode: 'individual', targetStars: 20, currentReward: '', kidStars: {}, sharedStars: 0 };
    }

    if (mode === 'shared') {
        appConfig.rewards.sharedStars = (appConfig.rewards.sharedStars || 0) + stars;
    } else {
        if (!appConfig.rewards.kidStars) appConfig.rewards.kidStars = {};
        appConfig.rewards.kidStars[kid.id] = (appConfig.rewards.kidStars[kid.id] || 0) + stars;
    }

    return { entry, rewards: appConfig.rewards };
}

/**
 * Reverses a grant. Uses the entry's persisted `mode` (not current config
 * mode) so rollbacks are correct even if the admin switches modes in between.
 * Silent no-op if entry not found. Floor decrement at 0.
 */
export function revokeChoreStars(appConfig, rewardsData, completionId) {
    const idx = rewardsData.completions.findIndex(e => e.id === completionId);
    if (idx === -1) return { rewards: appConfig.rewards };

    const entry = rewardsData.completions[idx];
    const stars = entry.stars || 0;
    const mode = entry.mode || 'individual';

    if (!appConfig.rewards) appConfig.rewards = { mode: 'individual', targetStars: 20, currentReward: '', kidStars: {}, sharedStars: 0 };

    if (mode === 'shared') {
        appConfig.rewards.sharedStars = Math.max(0, (appConfig.rewards.sharedStars || 0) - stars);
    } else {
        if (!appConfig.rewards.kidStars) appConfig.rewards.kidStars = {};
        appConfig.rewards.kidStars[entry.kidId] = Math.max(0, (appConfig.rewards.kidStars[entry.kidId] || 0) - stars);
    }

    rewardsData.completions.splice(idx, 1);
    return { rewards: appConfig.rewards };
}
```

- [ ] **Step 2: Rewrite `POST /api/rewards/complete` in `server/index.js`**

Replace the body of the handler (lines ~703-745) with:

```js
app.post('/api/rewards/complete', (req, res) => {
    const { taskId, kidId, pin } = req.body;

    const adminPin = appConfig.adminPin || '1234';
    if (pin !== adminPin) {
        return res.status(401).json({ error: 'Falsche PIN' });
    }

    try {
        const { entry, rewards } = grantChoreStars(appConfig, rewardsData, {
            taskId, kidId, source: 'chore'
        });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
        saveRewardsData();
        res.json({ success: true, entry, rewards });
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});
```

Add import at top near other choreLogic imports:
```js
import { checkAndRotateChores, grantChoreStars, revokeChoreStars } from './choreLogic.js';
```
(If `checkAndRotateChores` is currently imported elsewhere, adapt.)

- [ ] **Step 3: Smoke-test manually**

```bash
# Start server
npm run server
```
Open dashboard, approve device, go to Chores, complete a task with PIN.
Expected: star count goes up exactly as before.

- [ ] **Step 4: Commit**

```bash
git add server/choreLogic.js server/index.js
git commit -m "Refactor star-grant into reusable choreLogic helpers"
```

---

## Task 1: Bathroom state module (server-side)

**Files:**
- Create: `server/bathroomState.js`

- [ ] **Step 1: Create the state module**

```js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_PATH = path.join(__dirname, 'data', 'bathroom-state.json');

const defaultState = () => ({
    currentWindow: 'none',
    windowStartedAt: 0,
    completed: {}
});

export function loadBathroomState() {
    try {
        if (!fs.existsSync(STATE_PATH)) return defaultState();
        const raw = fs.readFileSync(STATE_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            currentWindow: parsed.currentWindow || 'none',
            windowStartedAt: parsed.windowStartedAt || 0,
            completed: parsed.completed || {}
        };
    } catch (err) {
        console.warn('[bathroomState] corrupt state file, resetting:', err.message);
        return defaultState();
    }
}

export function saveBathroomState(state) {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Computes the active window for a given clock time against a schedule.
 * Returns 'morning' | 'evening' | 'none'.
 * Schedule format: { morningStart: "06:00", morningEnd, eveningStart, eveningEnd }.
 * If schedule is missing/invalid, returns 'none'.
 */
export function computeActiveWindow(schedule, now = new Date()) {
    if (!schedule) return 'none';
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const inRange = (start, end) => start && end && hm >= start && hm < end;
    if (inRange(schedule.morningStart, schedule.morningEnd)) return 'morning';
    if (inRange(schedule.eveningStart, schedule.eveningEnd)) return 'evening';
    return 'none';
}

/**
 * Reconciles stored state against the currently-active window.
 * If the window changed, clears completed entries whose `window` doesn't
 * match the new active one, and updates currentWindow/windowStartedAt.
 * Returns { state, changed }.
 */
export function reconcileWindow(state, activeWindow, now = Date.now()) {
    if (state.currentWindow === activeWindow) {
        return { state, changed: false };
    }
    const filtered = {};
    for (const [itemId, entry] of Object.entries(state.completed || {})) {
        if (entry?.window === activeWindow) filtered[itemId] = entry;
    }
    return {
        state: { currentWindow: activeWindow, windowStartedAt: now, completed: filtered },
        changed: true
    };
}

/**
 * Returns the next window start (HH:mm) as the caption source for the
 * clock screen. Simple: picks whichever of morning/evening start is
 * chronologically next from `now`.
 */
export function nextWindowInfo(schedule, now = new Date()) {
    if (!schedule) return null;
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const candidates = [
        { name: 'morning', startsAt: schedule.morningStart },
        { name: 'evening', startsAt: schedule.eveningStart }
    ].filter(c => c.startsAt);

    const upcoming = candidates.filter(c => c.startsAt > hm);
    if (upcoming.length > 0) {
        upcoming.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        return upcoming[0];
    }
    // Nothing later today → earliest window tomorrow
    candidates.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return candidates[0] || null;
}
```

- [ ] **Step 2: Commit**

```bash
git add server/bathroomState.js
git commit -m "Add bathroom state module with window reconciliation"
```

---

## Task 2: Bathroom API endpoints

**Files:**
- Modify: `server/index.js` — add 3 endpoints

- [ ] **Step 1: Add imports and endpoints**

Near the other imports at the top of `server/index.js`:
```js
import {
    loadBathroomState, saveBathroomState,
    computeActiveWindow, reconcileWindow, nextWindowInfo
} from './bathroomState.js';
```

Add the following block before the `app.listen(PORT, ...)` call (or near the other route groups):

```js
// --- BATHROOM ROUTES ---

const DEFAULT_SCHEDULE = {
    morningStart: '06:00', morningEnd: '10:00',
    eveningStart: '18:00', eveningEnd: '22:00'
};

function getBathroomSchedule() {
    return { ...DEFAULT_SCHEDULE, ...(appConfig.bathroom?.schedule || {}) };
}

function getBathroomItems() {
    return appConfig.bathroom?.items || [];
}

function itemIsInWindow(item, window) {
    if (!item) return false;
    if (item.timeSlot === 'both') return window === 'morning' || window === 'evening';
    return item.timeSlot === window;
}

function buildStateResponse(state, schedule) {
    const window = state.currentWindow;
    const items = window === 'none'
        ? []
        : getBathroomItems().filter(i => itemIsInWindow(i, window));
    return {
        currentWindow: window,
        schedule,
        items,
        completed: state.completed,
        kids: appConfig.chores?.kids || [],
        nextWindow: nextWindowInfo(schedule)
    };
}

app.get('/api/bathroom/state', (req, res) => {
    const schedule = getBathroomSchedule();
    const active = computeActiveWindow(schedule);
    let state = loadBathroomState();
    const { state: nextState, changed } = reconcileWindow(state, active);
    if (changed) {
        state = nextState;
        saveBathroomState(state);
    }
    res.json(buildStateResponse(state, schedule));
});

app.post('/api/bathroom/toggle', (req, res) => {
    const { itemId, action } = req.body || {};
    if (!itemId || !['complete', 'uncomplete'].includes(action)) {
        return res.status(400).json({ error: 'Invalid body' });
    }

    const schedule = getBathroomSchedule();
    const active = computeActiveWindow(schedule);
    let state = loadBathroomState();
    const rec = reconcileWindow(state, active);
    state = rec.state;

    if (active === 'none') {
        return res.status(400).json({ error: 'Outside active window' });
    }

    const item = getBathroomItems().find(i => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!itemIsInWindow(item, active)) {
        return res.status(400).json({ error: 'Item not in current window' });
    }

    if (action === 'complete') {
        const existing = state.completed[itemId];
        if (existing && existing.window === active) {
            return res.status(409).json({ error: 'Already completed in this window' });
        }

        let linkedChoreCompletionId;
        let linkedChoreWarning = false;
        if (item.linkedChoreId) {
            try {
                const { entry } = grantChoreStars(appConfig, rewardsData, {
                    taskId: item.linkedChoreId,
                    kidId: item.assignedTo,
                    source: 'bathroom'
                });
                linkedChoreCompletionId = entry.id;
            } catch (err) {
                console.warn('[bathroom] linked chore grant failed:', err.message);
                linkedChoreWarning = true;
            }
        }

        const timestamp = Date.now();
        state.completed[itemId] = { timestamp, window: active, linkedChoreCompletionId };
        saveBathroomState(state);
        if (linkedChoreCompletionId) {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
            saveRewardsData();
        }

        return res.json({
            ...buildStateResponse(state, schedule),
            completedAt: timestamp,
            linkedChoreWarning
        });
    }

    // uncomplete
    const entry = state.completed[itemId];
    if (!entry || entry.window !== active) {
        return res.status(404).json({ error: 'No active completion to undo' });
    }
    const UNDO_WINDOW_MS = 30_000;
    if (Date.now() - entry.timestamp > UNDO_WINDOW_MS) {
        return res.status(410).json({ error: 'Undo window expired' });
    }
    if (entry.linkedChoreCompletionId) {
        revokeChoreStars(appConfig, rewardsData, entry.linkedChoreCompletionId);
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
        saveRewardsData();
    }
    delete state.completed[itemId];
    saveBathroomState(state);
    return res.json(buildStateResponse(state, schedule));
});

app.post('/api/bathroom/reset', (req, res) => {
    const { pin } = req.body || {};
    const adminPin = appConfig.adminPin || '1234';
    if (pin !== adminPin) return res.status(401).json({ error: 'Falsche PIN' });

    const schedule = getBathroomSchedule();
    const active = computeActiveWindow(schedule);
    let state = loadBathroomState();
    // Drop only the current window's entries; keep any stale entries
    // (reconcile will eventually cull them).
    const kept = {};
    for (const [itemId, entry] of Object.entries(state.completed || {})) {
        if (entry?.window !== active) kept[itemId] = entry;
    }
    state.completed = kept;
    state.currentWindow = active;
    state.windowStartedAt = Date.now();
    saveBathroomState(state);
    res.json(buildStateResponse(state, schedule));
});
```

- [ ] **Step 2: Smoke-test**

```bash
npm run server
```
In a second terminal:
```bash
curl -H "x-device-id: <your-id>" http://localhost:3001/api/bathroom/state
```
Expected: `{ currentWindow: "none" or a window, items: [], ... }` depending on current time.

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "Add bathroom API endpoints (state/toggle/reset)"
```

---

## Task 3: Integration test script

**Files:**
- Create: `server/test/bathroom.test.js`

- [ ] **Step 1: Write the test script**

This is a standalone node script — the repo has no test framework. It exits nonzero on first failed assertion.

```js
// Run with: node server/test/bathroom.test.js
// Purpose: exercise grantChoreStars/revokeChoreStars and reconcileWindow
// without touching the server at all. No disk writes.
import assert from 'node:assert/strict';
import { grantChoreStars, revokeChoreStars } from '../choreLogic.js';
import { computeActiveWindow, reconcileWindow, nextWindowInfo } from '../bathroomState.js';

function makeConfig() {
    return {
        chores: {
            tasks: [{ id: 't1', label: 'Test', difficulty: 2 }],
            kids: [{ id: 'k1', name: 'Kind' }]
        },
        rewards: { mode: 'individual', targetStars: 20, currentReward: '', kidStars: {}, sharedStars: 0 }
    };
}

// grantChoreStars adds correct stars in individual mode
{
    const cfg = makeConfig();
    const rd = { completions: [] };
    const { entry, rewards } = grantChoreStars(cfg, rd, { taskId: 't1', kidId: 'k1', source: 'bathroom' });
    assert.equal(entry.stars, 2);
    assert.equal(entry.source, 'bathroom');
    assert.equal(entry.mode, 'individual');
    assert.equal(rewards.kidStars.k1, 2);
    assert.equal(rd.completions.length, 1);
    console.log('✓ grantChoreStars individual');
}

// grantChoreStars adds to sharedStars in shared mode
{
    const cfg = makeConfig();
    cfg.rewards.mode = 'shared';
    const rd = { completions: [] };
    grantChoreStars(cfg, rd, { taskId: 't1', kidId: 'k1' });
    assert.equal(cfg.rewards.sharedStars, 2);
    console.log('✓ grantChoreStars shared');
}

// revokeChoreStars rolls back correctly
{
    const cfg = makeConfig();
    const rd = { completions: [] };
    const { entry } = grantChoreStars(cfg, rd, { taskId: 't1', kidId: 'k1' });
    revokeChoreStars(cfg, rd, entry.id);
    assert.equal(cfg.rewards.kidStars.k1, 0);
    assert.equal(rd.completions.length, 0);
    console.log('✓ revokeChoreStars individual');
}

// revokeChoreStars respects entry's mode even if config flipped
{
    const cfg = makeConfig();
    const rd = { completions: [] };
    const { entry } = grantChoreStars(cfg, rd, { taskId: 't1', kidId: 'k1' });
    // Admin flips mode after grant
    cfg.rewards.mode = 'shared';
    cfg.rewards.sharedStars = 100;  // unrelated pre-existing shared stars
    revokeChoreStars(cfg, rd, entry.id);
    // Should have decremented individual pot, not touched shared
    assert.equal(cfg.rewards.kidStars.k1, 0);
    assert.equal(cfg.rewards.sharedStars, 100);
    console.log('✓ revokeChoreStars uses entry mode not current mode');
}

// computeActiveWindow returns correct window
{
    const schedule = { morningStart: '06:00', morningEnd: '10:00', eveningStart: '18:00', eveningEnd: '22:00' };
    const at = (h, m) => new Date(2026, 0, 1, h, m);
    assert.equal(computeActiveWindow(schedule, at(7, 0)), 'morning');
    assert.equal(computeActiveWindow(schedule, at(10, 0)), 'none'); // exclusive end
    assert.equal(computeActiveWindow(schedule, at(19, 30)), 'evening');
    assert.equal(computeActiveWindow(schedule, at(12, 0)), 'none');
    console.log('✓ computeActiveWindow');
}

// reconcileWindow clears stale entries
{
    const state = {
        currentWindow: 'morning',
        windowStartedAt: 0,
        completed: {
            'a': { timestamp: 1, window: 'morning' },
            'b': { timestamp: 2, window: 'evening' }
        }
    };
    const { state: next, changed } = reconcileWindow(state, 'evening');
    assert.equal(changed, true);
    assert.equal(next.currentWindow, 'evening');
    assert.deepEqual(Object.keys(next.completed), ['b']);
    console.log('✓ reconcileWindow clears stale entries');
}

// reconcileWindow is no-op when window unchanged
{
    const state = { currentWindow: 'morning', windowStartedAt: 123, completed: { a: { window: 'morning' } } };
    const { state: next, changed } = reconcileWindow(state, 'morning');
    assert.equal(changed, false);
    assert.equal(next, state);
    console.log('✓ reconcileWindow no-op');
}

// nextWindowInfo picks chronologically-next start
{
    const schedule = { morningStart: '06:00', morningEnd: '10:00', eveningStart: '18:00', eveningEnd: '22:00' };
    const at = (h, m) => new Date(2026, 0, 1, h, m);
    assert.equal(nextWindowInfo(schedule, at(5, 0)).name, 'morning');
    assert.equal(nextWindowInfo(schedule, at(12, 0)).name, 'evening');
    assert.equal(nextWindowInfo(schedule, at(23, 0)).name, 'morning'); // wraps
    console.log('✓ nextWindowInfo');
}

console.log('\nAll bathroom tests passed.');
```

- [ ] **Step 2: Run the tests**

```bash
node server/test/bathroom.test.js
```
Expected: all `✓` lines, then `All bathroom tests passed.`

- [ ] **Step 3: Commit**

```bash
git add server/test/bathroom.test.js
git commit -m "Add bathroom integration tests"
```

---

## Task 4: Extend `AppConfig` and ConfigContext merge

**Files:**
- Modify: `src/contexts/ConfigContext.tsx`

- [ ] **Step 1: Add types near the other exports**

Insert after the `Chore` interface:

```ts
export interface BathroomItem {
    id: string;
    label: string;
    icon: string;
    assignedTo: string;
    timeSlot: 'morning' | 'evening' | 'both';
    linkedChoreId?: string;
}

export interface BathroomSchedule {
    morningStart: string;
    morningEnd: string;
    eveningStart: string;
    eveningEnd: string;
}

export interface BathroomConfig {
    items: BathroomItem[];
    schedule: BathroomSchedule;
}
```

Add `bathroom?: BathroomConfig;` to the `AppConfig` interface.

- [ ] **Step 2: Add default value**

In `defaultConfig`:

```ts
bathroom: {
    items: [],
    schedule: {
        morningStart: '06:00',
        morningEnd: '10:00',
        eveningStart: '18:00',
        eveningEnd: '22:00'
    }
},
```

- [ ] **Step 3: Extend the merge block**

Inside the `.then(data => { ... setConfig(prev => { const merged = { ... } })` block, add:

```ts
bathroom: {
    items: data.bathroom?.items || prev.bathroom?.items || [],
    schedule: {
        morningStart: data.bathroom?.schedule?.morningStart || prev.bathroom?.schedule?.morningStart || '06:00',
        morningEnd:   data.bathroom?.schedule?.morningEnd   || prev.bathroom?.schedule?.morningEnd   || '10:00',
        eveningStart: data.bathroom?.schedule?.eveningStart || prev.bathroom?.schedule?.eveningStart || '18:00',
        eveningEnd:   data.bathroom?.schedule?.eveningEnd   || prev.bathroom?.schedule?.eveningEnd   || '22:00'
    }
},
```

- [ ] **Step 4: Commit**

```bash
git add src/contexts/ConfigContext.tsx
git commit -m "Add BathroomConfig to AppConfig with merge support"
```

---

## Task 5: Bathroom frontend types and shared utilities

**Files:**
- Create: `src/pages/Bathroom/types.ts`

- [ ] **Step 1: Write the types**

```ts
import type { BathroomItem, BathroomSchedule, Kid } from '../../contexts/ConfigContext';

export type WindowName = 'morning' | 'evening' | 'none';

export interface CompletedEntry {
    timestamp: number;
    window: 'morning' | 'evening';
    linkedChoreCompletionId?: string;
}

export interface BathroomStateResponse {
    currentWindow: WindowName;
    schedule: BathroomSchedule;
    items: BathroomItem[];
    completed: Record<string, CompletedEntry>;
    kids: Kid[];
    nextWindow: { name: 'morning' | 'evening'; startsAt: string } | null;
    completedAt?: number;           // only on toggle response
    linkedChoreWarning?: boolean;   // only on toggle response
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Bathroom/types.ts
git commit -m "Add bathroom frontend types"
```

---

## Task 6: BathroomView (main Echo-facing component)

**Files:**
- Create: `src/pages/Bathroom/BathroomView.tsx`

- [ ] **Step 1: Write the component**

```tsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSecurity } from '../../contexts/SecurityContext';
import { getApiUrl } from '../../utils/api';
import type { BathroomStateResponse } from './types';
import { ActiveWindowList } from './ActiveWindowList';
import { ClockScreen } from './ClockScreen';
import { SuccessScreen } from './SuccessScreen';

const POLL_MS = 30_000;

const BathroomView: React.FC = () => {
    const { deviceId } = useSecurity();
    const [state, setState] = useState<BathroomStateResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const API_URL = getApiUrl();
    const abortRef = useRef<AbortController | null>(null);

    const fetchState = useCallback(async () => {
        if (!deviceId) return;
        abortRef.current?.abort();
        const ctl = new AbortController();
        abortRef.current = ctl;
        try {
            const res = await fetch(`${API_URL}/api/bathroom/state`, {
                headers: { 'x-device-id': deviceId },
                signal: ctl.signal
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: BathroomStateResponse = await res.json();
            setState(data);
            setError(null);
        } catch (err: any) {
            if (err.name === 'AbortError') return;
            setError('Keine Verbindung');
        }
    }, [API_URL, deviceId]);

    useEffect(() => {
        fetchState();
        const id = setInterval(fetchState, POLL_MS);
        return () => { clearInterval(id); abortRef.current?.abort(); };
    }, [fetchState]);

    const toggle = useCallback(async (itemId: string, action: 'complete' | 'uncomplete') => {
        if (!deviceId) return null;
        const res = await fetch(`${API_URL}/api/bathroom/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
            body: JSON.stringify({ itemId, action })
        });
        if (res.status === 409) {
            // Already completed — reconcile by refetching
            fetchState();
            return null;
        }
        if (!res.ok) {
            setError('Fehler');
            return null;
        }
        const data: BathroomStateResponse = await res.json();
        setState(data);
        setError(null);
        return data;
    }, [API_URL, deviceId, fetchState]);

    if (!state) {
        return (
            <div className="h-screen w-screen bg-slate-900 text-slate-400 flex items-center justify-center">
                {error || 'Lädt...'}
            </div>
        );
    }

    if (state.currentWindow === 'none') {
        return <ClockScreen nextWindow={state.nextWindow} error={error} />;
    }

    const windowItems = state.items;
    const openItems = windowItems.filter(i => !state.completed[i.id]);
    if (windowItems.length > 0 && openItems.length === 0) {
        return <SuccessScreen window={state.currentWindow} items={windowItems} />;
    }

    return (
        <ActiveWindowList
            state={state}
            onToggle={toggle}
            error={error}
        />
    );
};

export default BathroomView;
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Bathroom/BathroomView.tsx
git commit -m "Add BathroomView main component"
```

---

## Task 7: ActiveWindowList, ClockScreen, SuccessScreen

**Files:**
- Create: `src/pages/Bathroom/ActiveWindowList.tsx`
- Create: `src/pages/Bathroom/ClockScreen.tsx`
- Create: `src/pages/Bathroom/SuccessScreen.tsx`

- [ ] **Step 1: ActiveWindowList**

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Check, Sunrise, Moon, Undo2, AlertTriangle } from 'lucide-react';
import { ChoreIcon } from '../../components/ChoreIcon';
import type { BathroomStateResponse } from './types';

interface Props {
    state: BathroomStateResponse;
    onToggle: (itemId: string, action: 'complete' | 'uncomplete') => Promise<BathroomStateResponse | null>;
    error: string | null;
}

const UNDO_MS = 30_000;

function formatClock(d: Date) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const ActiveWindowList: React.FC<Props> = ({ state, onToggle, error }) => {
    const [clock, setClock] = useState(() => formatClock(new Date()));
    const [undo, setUndo] = useState<{ itemId: string; serverTimestamp: number } | null>(null);
    const [undoRemainingMs, setUndoRemainingMs] = useState(0);
    const undoTimer = useRef<number | null>(null);

    useEffect(() => {
        const id = setInterval(() => setClock(formatClock(new Date())), 10_000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (!undo) return;
        // Countdown derived from server timestamp, NOT local Date.now() at press time
        const tick = () => {
            const remaining = UNDO_MS - (Date.now() - undo.serverTimestamp);
            if (remaining <= 0) {
                setUndo(null);
                setUndoRemainingMs(0);
                return;
            }
            setUndoRemainingMs(remaining);
        };
        tick();
        const id = window.setInterval(tick, 250);
        undoTimer.current = id;
        return () => { window.clearInterval(id); };
    }, [undo]);

    const kidMap = new Map(state.kids.map(k => [k.id, k]));
    const isMorning = state.currentWindow === 'morning';
    const windowLabel = isMorning ? 'Morgen-Routine' : 'Abend-Routine';
    const WindowIcon = isMorning ? Sunrise : Moon;
    const doneCount = state.items.filter(i => state.completed[i.id]).length;

    const handleTap = async (item: (typeof state.items)[number]) => {
        const done = !!state.completed[item.id];
        if (done) {
            await onToggle(item.id, 'uncomplete');
            return;
        }
        const resp = await onToggle(item.id, 'complete');
        if (resp?.completedAt) {
            setUndo({ itemId: item.id, serverTimestamp: resp.completedAt });
        }
    };

    const handleUndoClick = async () => {
        if (!undo) return;
        await onToggle(undo.itemId, 'uncomplete');
        setUndo(null);
    };

    return (
        <div className="h-screen w-screen bg-slate-900 text-white overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex-none h-10 px-4 flex items-center justify-between border-b border-slate-800 bg-slate-950">
                <div className="flex items-center gap-2 text-base">
                    <WindowIcon className="w-5 h-5 text-yellow-300" />
                    <span className="font-semibold">{windowLabel}</span>
                </div>
                <div className="flex items-center gap-4 text-base">
                    <span className="tabular-nums">{clock}</span>
                    <span className="text-slate-400">{doneCount} von {state.items.length}</span>
                </div>
            </div>

            {/* List (4 × 88px visible @ 430px budget) */}
            <div className="flex-1 overflow-y-auto">
                {state.items.map(item => {
                    const done = !!state.completed[item.id];
                    const kid = kidMap.get(item.assignedTo);
                    return (
                        <button
                            key={item.id}
                            onClick={() => handleTap(item)}
                            className={`w-full h-[88px] px-4 flex items-center gap-3 border-b border-slate-800 active:bg-slate-800 transition ${
                                done ? 'opacity-50' : 'bg-slate-900'
                            }`}
                        >
                            <span
                                className="w-4 h-4 rounded-full flex-none"
                                style={{ backgroundColor: kid?.color || '#94a3b8' }}
                                title={kid?.name || 'Unbekannt'}
                            />
                            <ChoreIcon icon={item.icon} className="w-8 h-8 text-white flex-none" />
                            <span className={`text-2xl font-bold flex-1 text-left ${done ? 'line-through' : ''}`}>
                                {item.label}
                            </span>
                            {done && <Check className="w-8 h-8 text-green-400 flex-none" />}
                        </button>
                    );
                })}
            </div>

            {/* Snackbar */}
            {undo && (
                <div className="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none">
                    <button
                        onClick={handleUndoClick}
                        className="pointer-events-auto bg-slate-800 text-white px-5 py-3 rounded-full shadow-lg flex items-center gap-2 border border-slate-700"
                    >
                        <Undo2 className="w-5 h-5" />
                        <span className="font-semibold">Rückgängig</span>
                        <span className="text-slate-400 text-sm tabular-nums">
                            {Math.ceil(undoRemainingMs / 1000)}s
                        </span>
                    </button>
                </div>
            )}

            {error && (
                <div className="absolute top-12 inset-x-0 flex justify-center">
                    <div className="bg-red-900/80 text-red-100 px-4 py-1 rounded flex items-center gap-2 text-sm">
                        <AlertTriangle className="w-4 h-4" /> {error}
                    </div>
                </div>
            )}
        </div>
    );
};
```

- [ ] **Step 2: ClockScreen**

```tsx
import React, { useEffect, useState } from 'react';
import type { BathroomStateResponse } from './types';

interface Props {
    nextWindow: BathroomStateResponse['nextWindow'];
    error: string | null;
}

function formatClock(d: Date) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const ClockScreen: React.FC<Props> = ({ nextWindow, error }) => {
    const [clock, setClock] = useState(() => formatClock(new Date()));
    useEffect(() => {
        const id = setInterval(() => setClock(formatClock(new Date())), 10_000);
        return () => clearInterval(id);
    }, []);

    const caption = nextWindow
        ? `Nächste Routine: ${nextWindow.name === 'morning' ? 'Morgen-Routine' : 'Abend-Routine'} um ${nextWindow.startsAt}`
        : 'Keine Routine geplant';

    return (
        <div className="h-screen w-screen bg-slate-950 text-white flex flex-col items-center justify-center">
            <div className="text-[96px] leading-none font-bold tabular-nums">{clock}</div>
            <div className="mt-6 text-lg text-slate-400">{caption}</div>
            {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
        </div>
    );
};
```

- [ ] **Step 3: SuccessScreen**

```tsx
import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { BathroomStateResponse } from './types';

interface Props {
    window: 'morning' | 'evening';
    items: BathroomStateResponse['items'];
}

export const SuccessScreen: React.FC<Props> = ({ window, items }) => {
    const label = window === 'morning' ? 'Morgen-Routine' : 'Abend-Routine';
    return (
        <div className="h-screen w-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6 text-center">
            <CheckCircle2 className="w-24 h-24 text-green-400 mb-4" />
            <div className="text-3xl font-bold">Super, alles erledigt!</div>
            <div className="text-base text-slate-400 mt-2">{label} abgeschlossen</div>
            <ul className="mt-6 text-sm text-slate-300 space-y-1 max-h-32 overflow-y-auto">
                {items.map(i => (
                    <li key={i.id}>✓ {i.label}</li>
                ))}
            </ul>
        </div>
    );
};
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Bathroom/ActiveWindowList.tsx src/pages/Bathroom/ClockScreen.tsx src/pages/Bathroom/SuccessScreen.tsx
git commit -m "Add ActiveWindowList, ClockScreen, SuccessScreen for bathroom view"
```

---

## Task 8: Wire route + export

**Files:**
- Modify: `src/pages/index.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add export**

In `src/pages/index.tsx`:
```ts
export { default as BathroomView } from './Bathroom/BathroomView';
```

- [ ] **Step 2: Add route**

In `src/App.tsx`, import `BathroomView` and add before the catch-all:
```tsx
<Route path="bathroom" element={<BathroomView />} />
```

- [ ] **Step 3: Smoke-test**

```bash
npm run dev
# In another terminal:
npm run server
```
Open `http://localhost:5173/bathroom`. Expected: Clock screen (unless current time is in default morning/evening window).

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.tsx src/App.tsx
git commit -m "Wire /bathroom route"
```

---

## Task 9: Admin panel for bathroom items + schedule

**Files:**
- Create: `src/pages/Admin/BathroomAdmin.tsx`
- Modify: `src/pages/Admin/AdminSettings.tsx` — mount the new panel

- [ ] **Step 1: Inspect existing AdminSettings structure**

Read `src/pages/Admin/AdminSettings.tsx` first to understand the tab/section pattern (how Chores admin is structured). Follow that pattern.

- [ ] **Step 2: Create `BathroomAdmin.tsx`**

Minimal working admin with:
- Schedule editor (4 time inputs: `morningStart`, `morningEnd`, `eveningStart`, `eveningEnd`) with overlap/format validation before save.
- Item CRUD list: add/edit/delete items with fields `label`, `icon` (text input accepting lucide names — AdminSettings patterns likely have an icon picker; reuse if possible), `assignedTo` (dropdown from `config.chores.kids`), `timeSlot` (`morning` | `evening` | `both`), `linkedChoreId` (optional dropdown from `config.chores.tasks`).
- "Reset current window" button: prompts for admin PIN, POSTs to `/api/bathroom/reset`.
- Info tooltip near `linkedChoreId`: "Bad-Items mit Sterne-Verknüpfung vergeben Sterne OHNE PIN, limitiert auf einmal pro Zeitfenster."

Use `uuid` (already a dep) for item IDs. Persist via `updateConfig({ bathroom: {...} })`.

Concrete skeleton:

```tsx
import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useConfig } from '../../contexts/ConfigContext';
import { useSecurity } from '../../contexts/SecurityContext';
import { getApiUrl } from '../../utils/api';
import type { BathroomItem, BathroomSchedule } from '../../contexts/ConfigContext';
import { Plus, Trash2, RotateCcw, Info } from 'lucide-react';

const DEFAULT_SCHEDULE: BathroomSchedule = {
    morningStart: '06:00', morningEnd: '10:00',
    eveningStart: '18:00', eveningEnd: '22:00'
};

export const BathroomAdmin: React.FC = () => {
    const { config, updateConfig } = useConfig();
    const { deviceId } = useSecurity();
    const API_URL = getApiUrl();

    const bathroom = config.bathroom || { items: [], schedule: DEFAULT_SCHEDULE };
    const kids = config.chores?.kids || [];
    const chores = config.chores?.tasks || [];
    const [scheduleDraft, setScheduleDraft] = useState<BathroomSchedule>(bathroom.schedule);
    const [scheduleError, setScheduleError] = useState('');
    const [resetPin, setResetPin] = useState('');
    const [resetMsg, setResetMsg] = useState('');

    const validateSchedule = (s: BathroomSchedule): string | null => {
        const re = /^([01]\d|2[0-3]):[0-5]\d$/;
        for (const k of ['morningStart', 'morningEnd', 'eveningStart', 'eveningEnd'] as const) {
            if (!re.test(s[k])) return `Ungültige Uhrzeit bei ${k}`;
        }
        if (s.morningStart >= s.morningEnd) return 'Morgen-Start muss vor Morgen-Ende liegen';
        if (s.eveningStart >= s.eveningEnd) return 'Abend-Start muss vor Abend-Ende liegen';
        // Overlap check
        if (s.morningStart < s.eveningEnd && s.eveningStart < s.morningEnd) {
            return 'Morgen- und Abend-Fenster überlappen';
        }
        return null;
    };

    const saveSchedule = () => {
        const err = validateSchedule(scheduleDraft);
        if (err) { setScheduleError(err); return; }
        setScheduleError('');
        updateConfig({ bathroom: { ...bathroom, schedule: scheduleDraft } });
    };

    const addItem = () => {
        const newItem: BathroomItem = {
            id: uuidv4(),
            label: 'Neue Aufgabe',
            icon: 'Check',
            assignedTo: kids[0]?.id || '',
            timeSlot: 'morning'
        };
        updateConfig({ bathroom: { ...bathroom, items: [...bathroom.items, newItem] } });
    };

    const updateItem = (id: string, patch: Partial<BathroomItem>) => {
        const next = bathroom.items.map(i => i.id === id ? { ...i, ...patch } : i);
        updateConfig({ bathroom: { ...bathroom, items: next } });
    };

    const deleteItem = (id: string) => {
        updateConfig({ bathroom: { ...bathroom, items: bathroom.items.filter(i => i.id !== id) } });
    };

    const triggerReset = async () => {
        setResetMsg('');
        try {
            const res = await fetch(`${API_URL}/api/bathroom/reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({ pin: resetPin })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setResetMsg(data.error || 'Fehler');
            } else {
                setResetMsg('Zurückgesetzt');
                setResetPin('');
            }
        } catch {
            setResetMsg('Verbindungsfehler');
        }
    };

    return (
        <div className="p-6 space-y-8 text-slate-900 dark:text-white">
            <h2 className="text-2xl font-bold">Bad</h2>

            {/* Schedule */}
            <section className="space-y-3">
                <h3 className="text-lg font-semibold">Zeitfenster</h3>
                <div className="grid grid-cols-2 gap-4">
                    {(['morningStart', 'morningEnd', 'eveningStart', 'eveningEnd'] as const).map(k => (
                        <label key={k} className="flex flex-col text-sm">
                            <span>{k}</span>
                            <input
                                type="time"
                                value={scheduleDraft[k]}
                                onChange={e => setScheduleDraft({ ...scheduleDraft, [k]: e.target.value })}
                                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white"
                            />
                        </label>
                    ))}
                </div>
                {scheduleError && <div className="text-red-400 text-sm">{scheduleError}</div>}
                <button onClick={saveSchedule} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">
                    Zeitfenster speichern
                </button>
            </section>

            {/* Items */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Aufgaben</h3>
                    <button onClick={addItem} className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded">
                        <Plus className="w-4 h-4" /> Hinzufügen
                    </button>
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Bad-Items mit Sterne-Verknüpfung vergeben Sterne OHNE PIN, limitiert auf einmal pro Zeitfenster.
                </p>
                <div className="space-y-2">
                    {bathroom.items.map(item => (
                        <div key={item.id} className="grid grid-cols-[1fr_8rem_6rem_8rem_10rem_auto] gap-2 items-center bg-slate-800 rounded p-2">
                            <input
                                value={item.label}
                                onChange={e => updateItem(item.id, { label: e.target.value })}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                                placeholder="Bezeichnung"
                            />
                            <input
                                value={item.icon}
                                onChange={e => updateItem(item.id, { icon: e.target.value })}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                                placeholder="Icon (z.B. Brush)"
                            />
                            <select
                                value={item.timeSlot}
                                onChange={e => updateItem(item.id, { timeSlot: e.target.value as BathroomItem['timeSlot'] })}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                            >
                                <option value="morning">Morgens</option>
                                <option value="evening">Abends</option>
                                <option value="both">Beides</option>
                            </select>
                            <select
                                value={item.assignedTo}
                                onChange={e => updateItem(item.id, { assignedTo: e.target.value })}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                            >
                                <option value="">— Kind —</option>
                                {kids.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                            </select>
                            <select
                                value={item.linkedChoreId || ''}
                                onChange={e => updateItem(item.id, { linkedChoreId: e.target.value || undefined })}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                            >
                                <option value="">— Keine Sterne —</option>
                                {chores.map(c => <option key={c.id} value={c.id}>{c.label} ({'★'.repeat(c.difficulty || 1)})</option>)}
                            </select>
                            <button
                                onClick={() => deleteItem(item.id)}
                                className="text-red-400 hover:text-red-300 p-2"
                                title="Löschen"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    {bathroom.items.length === 0 && (
                        <div className="text-slate-500 italic">Keine Aufgaben konfiguriert.</div>
                    )}
                </div>
            </section>

            {/* Reset */}
            <section className="space-y-3">
                <h3 className="text-lg font-semibold">Aktuelles Zeitfenster zurücksetzen</h3>
                <p className="text-sm text-slate-400">
                    Setzt die erledigten Aufgaben im aktuellen Zeitfenster zurück. Bereits vergebene Sterne bleiben erhalten.
                </p>
                <div className="flex items-center gap-2">
                    <input
                        type="password"
                        value={resetPin}
                        onChange={e => setResetPin(e.target.value)}
                        placeholder="Admin-PIN"
                        className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                    />
                    <button onClick={triggerReset} className="flex items-center gap-1 bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded">
                        <RotateCcw className="w-4 h-4" /> Zurücksetzen
                    </button>
                    {resetMsg && <span className="text-sm text-slate-300">{resetMsg}</span>}
                </div>
            </section>
        </div>
    );
};

export default BathroomAdmin;
```

- [ ] **Step 3: Mount the panel in `AdminSettings.tsx`**

Import `BathroomAdmin` and add it as a new tab/section following the same pattern used by the existing Chores admin section.

- [ ] **Step 4: Smoke-test**

Go to `/admin`, navigate to new "Bad" panel. Add an item, save schedule, reload page — values persist.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Admin/BathroomAdmin.tsx src/pages/Admin/AdminSettings.tsx
git commit -m "Add admin panel for bathroom items and schedule"
```

---

## Task 10: Navigation tile (optional)

**Files:**
- Modify: `src/components/layout/MainLayout.tsx`

- [ ] **Step 1: Add nav link**

Add a "Bad" tile/link to the nav using a bathroom-appropriate lucide icon (e.g. `Droplets`). Mirror the existing nav pattern in `MainLayout.tsx`.

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/MainLayout.tsx
git commit -m "Add Bad navigation tile"
```

---

## Task 11: End-to-end manual test

- [ ] **Step 1: Start full stack**

```bash
npm run server   # terminal 1
npm run dev      # terminal 2
```

- [ ] **Step 2: Configure via admin**
  - Approve device.
  - Create 2 kids in Chores if not there (required — bathroom items need `assignedTo`).
  - Open Bad admin: set schedule spanning current time, create 2–3 items (one with linkedChoreId, one without).

- [ ] **Step 3: Open `/bathroom`**
  - Verify items show. Tap an unlinked item → snackbar "Rückgängig" appears, countdown ticks.
  - Tap linked item → in Chores admin verify star count went up.
  - Tap undo on linked item → stars back down.
  - Tap same item twice rapidly → second call silently reconciles (no error UI).

- [ ] **Step 4: Verify window behavior**
  - In admin, set schedule to be currently out-of-window. Refresh → clock screen.
  - Set schedule back → items return.

- [ ] **Step 5: Verify reset**
  - Complete an item. Admin reset → item reappears in open list.

- [ ] **Step 6: Echo physical test (if device is ready)**
  - Open the URL on Echo Show 5 browser. Verify layout fits (Silk chrome ~430px budget).
  - Taps are responsive. Text legible from ~1 m.

---

## Task 12: Claude-Code prompt for music-assistant-pwa

**Files:**
- Create: `docs/superpowers/plans/2026-04-21-bathroom-echo-music-assistant-prompt.md`

- [ ] **Step 1: Write the prompt file**

This is a pure documentation deliverable for the user to paste into a Claude-Code session in the `music-assistant-pwa` repo. Content:

```markdown
# Prompt for music-assistant-pwa: Bathroom checklist link

Copy the following into a Claude-Code session started in the
`music-assistant-pwa` repo (https://github.com/nobbie2009/music-assistant-pwa).

---

I want to add a small button/tile on the main screen of this PWA that opens
the bathroom checklist hosted by my homedashboard. The checklist is a
separate web page; this PWA just needs to navigate there in the same
browser window.

Target URL (configurable): `http://<dashboard-host>:3001/bathroom`
(or the bare host without port if the nginx proxy serves it on port 80;
it's `http://<dashboard-ip>/bathroom` for production, `http://localhost:5173/bathroom`
for dev.)

Requirements:
1. Add a config option (env var `VITE_BATHROOM_URL` or similar, following
   this project's existing config convention) for the bathroom URL. Default
   empty — if empty, don't render the button.
2. Add a visible button/tile on the main screen labeled "Bad" with a
   bathroom-themed icon (droplet or similar). Position: follow the existing
   button grid. Button opens the configured URL in the same tab
   (`window.location.href = URL`) — NOT a new tab, because the Echo Show's
   Silk browser handles new tabs poorly.
3. No auth, no iframes, no data fetching. This PWA is purely a launcher
   for the dashboard URL.
4. Make sure the button is touch-friendly (min 64×64 px) and readable on
   Echo Show 5 (960×480 with ~50px Silk chrome).
5. Update the README to document the new env var.

Do NOT add any API integration with the dashboard — all the logic lives
on the dashboard side. This PWA just links to it.

Please scan the repo first to match existing patterns (config, button
grid layout, styling) before writing code. Then implement, test locally
if possible, and commit.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-04-21-bathroom-echo-music-assistant-prompt.md
git commit -m "Add Claude-Code prompt for music-assistant-pwa integration"
```

---

## Summary of deliverables

After all tasks:
- New `/bathroom` route + Echo-optimized UI
- New admin "Bad" panel with item CRUD, schedule editor, reset button
- Three new API endpoints (`state`, `toggle`, `reset`)
- Refactored shared star-grant helpers (no behavior change for existing chores)
- Integration test script (standalone node)
- Claude-Code prompt ready to hand to the music-assistant-pwa repo
