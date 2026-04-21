# Haushalt — Wiederkehrende Aufgaben — Design

**Date:** 2026-04-21
**Target:** homedashboard (this repo)

## Goal

A new standalone "Haushalt" feature for tracking recurring household tasks
(e.g. Ölwechsel alle 6 Monate, Staub wischen alle 2 Wochen, Filter
wechseln monatlich). Independent from Chores (kids/stars) and Bathroom
(morning/evening). Addresses use cases where a task repeats on a
configurable interval — either relative to last completion or tied to a
fixed starting date.

## Decisions (confirmed in brainstorming)

- **Scope:** Standalone feature — own route, own admin section, own data
  structures. NOT a bathroom extension, NOT a chores extension. Adults'
  household maintenance — no star rewards, no kids integration.
- **People:** New entity `HouseholdMember` (separate from `chores.kids`).
  Name + color + optional photo.
- **Interval definition:** Free `{ intervalValue: number, intervalUnit: 'days'|'weeks'|'months' }`.
  Admin UI provides preset quick-buttons (Wöchentlich, 14-tägig, Monatlich,
  Vierteljährlich, Halbjährlich, Jährlich) that set the two fields — no
  separate "preset" storage field.
- **Recurrence mode:** Two modes per task: `relative` (next due =
  lastCompleted + interval) or `absolute` (fixed anchor startDate, next
  due = next member of `startDate + k * interval` that is after now).
- **Display:** Single flat list on the Haushalt page, sorted by
  `nextDueAt` ascending. Overdue items first, then soon-due, then far.
  Visual severity: overdue (red border + icon), due in ≤3 days (yellow),
  rest (neutral).
- **Completion:** Single "Erledigt" button per task. If multiple members
  exist, a small "Wer hat's gemacht?" picker appears; otherwise logged to
  the assigned member automatically. `lastCompletedAt` and
  `lastCompletedBy` stored on task.
- **Stars integration:** None. Explicit scope decision.
- **Reminders/notifications:** None in v1. Passive display only.
- **History:** Only `lastCompletedAt` / `lastCompletedBy` per task. No
  full completion log in v1.

## Architecture

### New route
- `/household` — new React route under existing `MainLayout` /
  `SecurityGate`. Dashboard-oriented layout (no Echo-specific
  optimization). Nav tile labeled "Haushalt" with lucide icon.

### New admin section
Mounted as a new tab in `AdminSettings` alongside "Bad":
- Members CRUD (name, color, optional photo — photo upload is
  out of scope v1 but field kept in model for later).
- Tasks CRUD with inline editor (label, icon, description, assignedTo,
  recurrence, startDate for absolute mode).
- Preset quick-buttons next to `intervalValue`/`intervalUnit` that
  populate those fields (no preset persisted separately).

### Data model (additions to `AppConfig`)

```ts
export interface HouseholdMember {
    id: string;
    name: string;
    color: string;     // hex
    photo?: string;    // base64 optional — reserved for future use; v1 admin writes nothing here
}

export type IntervalUnit = 'days' | 'weeks' | 'months';
export type RecurrenceMode = 'relative' | 'absolute';

export interface HouseholdRecurrence {
    mode: RecurrenceMode;
    intervalValue: number;       // positive integer
    intervalUnit: IntervalUnit;
    startDate?: string;          // YYYY-MM-DD; REQUIRED if mode === 'absolute'
}

export interface HouseholdTask {
    id: string;
    label: string;
    icon: string;                // lucide icon name
    description?: string;
    assignedTo?: string;         // HouseholdMember.id (optional)
    recurrence: HouseholdRecurrence;
    nextDueAt: number;           // epoch ms — server-computed & persisted
    lastCompletedAt?: number;    // epoch ms
    lastCompletedBy?: string;    // HouseholdMember.id
}

export interface HouseholdConfig {
    members: HouseholdMember[];
    tasks: HouseholdTask[];
}

// AppConfig gets: household?: HouseholdConfig
```

Defaults:
```ts
household: { members: [], tasks: [] }
```

### ConfigContext merge branch

`src/contexts/ConfigContext.tsx` hand-rolled merge block gains a new
`household` branch mirroring the pattern used for `bathroom`:

```ts
household: {
    members: data.household?.members || prev.household?.members || [],
    tasks: data.household?.tasks || prev.household?.tasks || []
}
```

### Persistence

Lives in `config.json` (same as `bathroom`, `chores`). Completion data
is stored directly on the task (`lastCompletedAt`, `nextDueAt`,
`lastCompletedBy`) — no separate state file. This is deliberately
different from `bathroom` which needs window-transition state; for
household, every task is self-contained.

### Core logic module

New `server/householdLogic.js`:

```js
// Add N units to a date, using date-fns which is already a dep.
// Returns a new epoch-ms value. `unit` is 'days' | 'weeks' | 'months'.
export function addInterval(dateMs, value, unit) { ... }

// Compute nextDueAt for a task given an anchor timestamp.
// - relative: addInterval(anchor, intervalValue, intervalUnit)
// - absolute: startDate + k * interval where k is smallest non-negative
//   integer such that the result is > max(anchor, now). EACH anchor is
//   computed as addInterval(startDate, k * intervalValue, intervalUnit)
//   — always from the original startDate, never iteratively from the
//   previous anchor, to avoid month-end truncation drift.
export function computeNextDue(task, anchorMs) { ... }

export function isOverdue(task, nowMs) {
    return task.nextDueAt < nowMs;
}

export function sortByDueDate(tasks) {
    return [...tasks].sort((a, b) => a.nextDueAt - b.nextDueAt);
}
```

`date-fns` utilities used: `addDays`, `addWeeks`, `addMonths` (confirmed
present at `^3.3.1` in `package.json`). These handle month-end and
leap-year edge cases with truncation semantics (e.g. 31 Jan + 1 month =
28/29 Feb). The absolute-mode algorithm compensates by always starting
from the original `startDate` — see "Config-POST normalization" above.

### API endpoints

All under existing `x-device-id` middleware.

**`GET /api/household/tasks`**

Response:
```json
{
  "tasks": [ ...HouseholdTask, sorted by nextDueAt ascending ],
  "members": [ ...HouseholdMember ],
  "now": 1745222400000
}
```

Server sorts; client renders directly. `now` anchors the client's "in X
days" computation against server clock (avoids skew on slow devices).

**`POST /api/household/complete`**

Body: `{ taskId: string, memberId?: string }`

1. Load task; 404 if not found.
2. `lastCompletedAt = now`
3. `lastCompletedBy = memberId || task.assignedTo || null`
4. `nextDueAt = computeNextDue(task, now)` (absolute mode uses `now` to
   find the next anchor; relative mode uses `now`).
5. Persist `appConfig` via existing `fs.writeFileSync(CONFIG_PATH, ...)`.
6. Return the updated task.

**`POST /api/household/undo`**

Body: `{ taskId: string }`

Lightweight mistake-recovery without PIN. Reverts the most recent
completion of this task if it was within the last **30 seconds** of
server time (i.e. the `lastCompletedAt` timestamp is within 30s of now).
Clears `lastCompletedAt`, `lastCompletedBy`, and recomputes `nextDueAt`
back to the pre-completion value (we therefore also need the
*previous* `nextDueAt` to restore). Implementation stores the prior
`nextDueAt` on a small in-memory per-task shadow that is populated on
`/complete` and consumed once by `/undo`; see "Undo implementation
detail" below. After 30 s the shadow is dropped (both server-side and
client-side the button disappears). Returns 410 Gone if the window has
expired or if no recent completion exists.

Manual correction of older entries ("I forgot to check, I actually did
it Tuesday") is done via the admin panel — the task editor allows
directly editing `lastCompletedAt`; the config POST normalization will
recompute `nextDueAt` accordingly.

### Config-POST normalization

**Normalization MUST run for EVERY household task on every incoming
`POST /api/config` that contains a `household` block**, unconditionally
replacing any client-provided `nextDueAt`. This catches:
- New tasks (no `lastCompletedAt`).
- Existing tasks where the admin changed `intervalValue`, `intervalUnit`,
  `mode`, or `startDate`.
- Any scenario where `nextDueAt` would otherwise drift out of sync with
  the current recurrence definition.

Concretely, the handler at `server/index.js` (currently the
`POST /api/config` handler doing `{ ...appConfig, ...req.body }` +
`fs.writeFileSync`) is extended with a pre-write pass:

```js
if (newConfig.household?.tasks) {
    for (const t of newConfig.household.tasks) {
        const anchor = t.lastCompletedAt ?? Date.now();
        t.nextDueAt = computeNextDue(t, anchor);
    }
}
```

The rule for `computeNextDue(task, anchor)`:
- **relative:** `nextDueAt = addInterval(anchor, intervalValue, intervalUnit)`
- **absolute:** `nextDueAt` = `startDateMs + k * interval`, where `k` is
  the smallest non-negative integer such that the resulting anchor is
  strictly greater than `max(anchor, Date.now())`. Each anchor is
  computed as `addInterval(startDate, k * intervalValue, intervalUnit)`
  — i.e. **always from the original `startDate`**, never iteratively
  from the previous anchor. This is important because date-fns
  `addMonths` truncates on short months (31 Jan + 1 month = 28/29 Feb);
  iterating that forward would permanently drift to day-28. Anchoring
  each step from `startDate` avoids the drift.

**Shallow-spread caveat (inherited from existing codebase convention):**
`POST /api/config` does a shallow merge (`{ ...appConfig, ...req.body }`
at `server/index.js:~490`). Clients must therefore send the full
`household` block (with all members + all tasks) in each POST, not a
partial patch. This matches how `chores` and `bathroom` are already
used; `ConfigContext.updateConfig` always sends the full merged config
exactly to avoid this trap.

This keeps the client dumb: the admin UI doesn't compute `nextDueAt` at
all; it just submits the task and the server fills it in.

### Admin UI details

- Preset buttons (click populates both fields):
  - Wöchentlich → `{1, 'weeks'}`
  - 14-tägig → `{2, 'weeks'}`
  - Monatlich → `{1, 'months'}`
  - Vierteljährlich → `{3, 'months'}`
  - Halbjährlich → `{6, 'months'}`
  - Jährlich → `{12, 'months'}`
- Absolute mode: shows a date input for `startDate`; hidden for relative.
- Validation before save:
  - `intervalValue` must be integer ≥ 1
  - `absolute` mode requires a valid `startDate` (YYYY-MM-DD)
  - Member names cannot be empty
- "Zuletzt erledigt" field: admin can manually override `lastCompletedAt`
  for migration/corrections. If overridden, server recomputes `nextDueAt`.

### UI — `/household` page

- Flat list sorted by `nextDueAt` asc.
- Per-task card:
  - Member dot (color) + member name, or "—" if unassigned.
  - Icon + label.
  - Subtitle: human-readable "in 3 Tagen" / "überfällig seit 2 Tagen" /
    "in 5 Monaten" — via `date-fns/formatDistance` with `locale: de`.
  - Meta row: "alle 2 Wochen" (from recurrence); "Zuletzt: 21.10.2025
    (Papa)" if known.
  - "Erledigt" button (right side).
- Severity styling:
  - Overdue → red border + `AlertTriangle` icon.
  - Due within 3 days → yellow border.
  - Else → neutral slate-800/900 border.
- Completion flow:
  - If 0 or 1 members → tap button = immediate POST with
    `task.assignedTo`.
  - If ≥2 members → popup with member chips; tap a chip = POST.
- **Undo snackbar** after completion: appears for 30 s, countdown
  derived from the server-returned `completedAt` timestamp (not local
  `Date.now()`), mirroring the bathroom undo pattern. Calls
  `POST /api/household/undo`. After 30 s the button vanishes both
  client-side and server-side (the shadow entry is dropped).
- Empty state: "Keine Aufgaben konfiguriert — im Admin unter Haushalt
  anlegen."
- No polling — simple one-time fetch on mount + refetch after each
  complete/undo. A "Aktualisieren" button can be added cheap if desired.

### Undo implementation detail

The `/undo` endpoint needs the task's `nextDueAt` value as it was
*before* the most recent `/complete`, so it can restore it. Two options:

1. **In-memory shadow map** on the server: `Map<taskId, { priorNextDueAt, priorLastCompletedAt, priorLastCompletedBy, completedAt }>`.
   Populated on `/complete`, consumed on `/undo`, entries expire after
   30 s (checked on access; a `setTimeout` eviction is optional).
   Shadow is lost on server restart — accepted limitation, since undo is
   only meaningful in the same browser session anyway.

2. **Persist the shadow in `bathroom-state`-style file** — heavier,
   unnecessary given the 30-second time bound.

Spec mandates option 1.

## Security

- All endpoints behind existing `x-device-id` middleware.
- Household completion is authenticated via device-id but not PIN-gated
  (consistent with bathroom: approved devices only). Manual correction
  of `lastCompletedAt` goes through the admin panel, which is behind
  the existing PIN-based AdminSettings unlock plus the standard config
  POST — intentionally the only edit path.
- `/undo` has no PIN and no admin gate because it is time-bound (30 s)
  and can only reverse an action the same approved device just took.

## Error handling

| Case | Behavior |
| ---- | -------- |
| Task deleted concurrently | `/complete` returns 404; client refetches |
| Member deleted that was `lastCompletedBy` | UI shows stored id as "Unbekannt"; no crash |
| Invalid interval (≤0, non-integer) | Admin save blocked with inline error |
| `absolute` mode without `startDate` | Admin save blocked |
| Startdate in the future | Allowed — `nextDueAt` initial value = `startDate` |
| Early completion in `absolute` mode | Server still advances to the next scheduled anchor after `now` — schedule is not reset by early completion (by design: "jeden 1." stays "jeden 1."). Documented behavior, not a bug. |
| Config corrupt / missing `household` | Merge branch yields defaults; endpoints return empty lists |
| Two devices complete different tasks within the same write window | Last-writer-wins on `config.json` — one update may be lost. Accepted limitation, consistent with existing bathroom/chores write model. |
| `/undo` after 30 s | 410 Gone; client UI stops showing the undo button at the same threshold |

## Testing

Standalone node script `server/test/household.test.js`, same pattern as
`bathroom.test.js`:

- `computeNextDue` relative: days / weeks / months
- `computeNextDue` relative: leap-year edge (29 Feb + 1 year → 28 Feb)
- `computeNextDue` absolute: past startDate → first future anchor
- `computeNextDue` absolute: future startDate → equals startDate
- `computeNextDue` absolute month-end: startDate = 31 Jan, monthly → 28
  Feb, 31 Mar, 30 Apr, … (anchors always computed from original
  startDate, never drifting to day-28)
- `isOverdue` boundary (exactly now, one ms before/after)
- `sortByDueDate` stability
- Config-POST normalization: new task without `lastCompletedAt` gets
  `nextDueAt` populated correctly in each mode
- Config-POST normalization: existing task with `lastCompletedAt` whose
  `intervalValue` changed from 7 to 14 days has `nextDueAt` recomputed
  to `lastCompletedAt + 14 days`
- Undo shadow: populated on `/complete`, consumed on `/undo`; `/undo` 31
  s after the completion → 410 Gone

No new framework. Runs via `node server/test/household.test.js`.

## Out of scope

- Push notifications, reminders, SSE integration
- Completion history beyond `lastCompletedAt` / `lastCompletedBy`
- Statistics / rollup reports
- ICS calendar export
- Foto upload for members (field reserved, no UI)
- Integration with Bathroom, Chores, or star rewards
- Bulk operations (mark all of type X done)
- Multiple assignees per task (exactly one or unassigned)
- Per-task notifications / per-user subscriptions

## Open questions — none
All resolved during brainstorming.
