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
    photo?: string;    // base64 optional — field reserved, v1 admin no upload UI
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
export function addInterval(dateMs, value, unit) { ... }

// Compute nextDueAt for a task given a "completed at" timestamp.
// - relative: completedAt + interval
// - absolute: smallest startDate + k*interval that is > now (completedAt
//   ignored in absolute mode beyond "now" reference)
export function computeNextDue(task, nowMs) { ... }

export function isOverdue(task, nowMs) {
    return task.nextDueAt < nowMs;
}

export function sortByDueDate(tasks) {
    return [...tasks].sort((a, b) => a.nextDueAt - b.nextDueAt);
}
```

`date-fns` utilities used: `addDays`, `addWeeks`, `addMonths`. These
handle month-end and leap-year edge cases correctly
(e.g. 29 Feb + 1 year = 28 Feb of next year).

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

**`POST /api/household/reset-last`** (admin PIN required)

Body: `{ taskId, lastCompletedAt: number|null, pin }`

For the rare manual correction case ("I forgot to check, I actually did
it Tuesday"). Updates `lastCompletedAt` and recomputes `nextDueAt`.

### Config-POST normalization

Small extension in `POST /api/config`: when the incoming body contains a
`household` block, before writing, server walks each task and normalizes
`nextDueAt`:

- If `lastCompletedAt` is set → `nextDueAt = computeNextDue(task, lastCompletedAt)`
- Otherwise (new task) →
  - relative: `nextDueAt = now + interval`
  - absolute: `nextDueAt` = first serial anchor `startDate + k*interval`
    that is ≥ now

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
- Empty state: "Keine Aufgaben konfiguriert — im Admin unter Haushalt
  anlegen."
- No polling — simple one-time fetch on mount + refetch after each
  complete. A "Aktualisieren" button can be added cheap if desired.

## Security

- All endpoints behind existing `x-device-id` middleware.
- `/reset-last` additionally requires admin PIN (similar to
  `/api/bathroom/reset`) — surface: admin-only correction.
- No new attack surface. Household completion is authenticated but not
  PIN-gated (consistent with bathroom: approved devices only).

## Error handling

| Case | Behavior |
| ---- | -------- |
| Task deleted concurrently | `/complete` returns 404; client refetches |
| Member deleted that was `lastCompletedBy` | UI shows stored id as "Unbekannt"; no crash |
| Invalid interval (≤0, non-integer) | Admin save blocked with inline error |
| `absolute` mode without `startDate` | Admin save blocked |
| Startdate in the future | Allowed — `nextDueAt` initial value = `startDate` |
| Config corrupt / missing `household` | Merge branch yields defaults; endpoints return empty lists |

## Testing

Standalone node script `server/test/household.test.js`, same pattern as
`bathroom.test.js`:

- `computeNextDue` relative: days / weeks / months
- `computeNextDue` relative: leap-year edge (29 Feb + 1 year → 28 Feb)
- `computeNextDue` absolute: past startDate → first future anchor
- `computeNextDue` absolute: future startDate → equals startDate
- `isOverdue` boundary (exactly now, one ms before/after)
- `sortByDueDate` stability
- Config-POST normalization: new task without `lastCompletedAt` gets
  `nextDueAt` populated correctly in each mode

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
