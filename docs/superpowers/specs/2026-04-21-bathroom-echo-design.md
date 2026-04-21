# Bathroom Echo Checklist — Design

**Date:** 2026-04-21
**Target:** homedashboard (this repo) + music-assistant-pwa (separate repo, consumer-side)

## Goal

A dedicated "bathroom" subpage in homedashboard that serves as a touch-friendly
checklist for children's bathroom routines (brushing teeth, washing, combing
hair, etc.) on an Amazon Echo Show 5 (960×480) running via the
`music-assistant-pwa` project. Kids check off their tasks on the Echo; the
existing Chores/Stars system is loosely integrated for items that correspond
to configured chores.

## Decisions (confirmed in brainstorming)

- **Relationship to existing Chores (question 1):** Hybrid — bathroom items are
  their own data structure with optional `linkedChoreId` reference. Items
  without a link are pure checklist entries; items with a link trigger the
  existing star-reward logic on complete.
- **Child identification on Echo (question 2):** Combined list with per-item
  kid assignment (avatar/color indicator). All kids see everything at once;
  each kid taps only their own items. No login step.
- **Time-of-day split (question 3):** Two fixed lists — morning and evening.
  Each item is tagged `morning | evening | both`. The Echo auto-shows the list
  matching the current time window.
- **Reset behavior (question 4):** Automatic reset at time-window boundary
  (morning → evening clears morning list; evening → next-morning clears evening
  list). Plus a manual "reset now" button in admin for edge cases.
- **Chore/Stars link (question 5):** Stars are granted when an item with
  `linkedChoreId` is completed on the Echo. The server enforces "1x per time
  window per item" to prevent duplicate stars. No PIN on the Echo.
- **API vs. HTML (question 6):** HTML subpage (`/bathroom` route) rendered by
  homedashboard directly. Echo loads this route in its browser. No changes to
  music-assistant-pwa beyond a link/button.
- **Admin section (question 7):** Dedicated new "Bad" section in AdminSettings,
  separate from Chores.
- **Time window configuration (question 8):** Configurable in admin (with
  sensible initial defaults: morning 06:00–10:00, evening 18:00–22:00).
- **Outside-window display (question 9):** Clock-only screen (no task
  preview), dark background.
- **Echo authentication (question 10):** Same device-gate as every other
  device — approve Echo once in admin via `x-device-id`. No bypass, no token.

## Architecture

### New route
- `/bathroom` — new React route under existing `MainLayout`/`SecurityGate`.
  Touch-optimized for Echo Show 5 (~960×480). Accessible from existing
  dashboard nav (optional tile) and directly via bookmarked URL on the Echo.

### New admin section
- `AdminSettings` gets a new "Bad" panel with:
  - Item CRUD (label, icon, assignedTo kidId, timeSlot, optional
    `linkedChoreId` dropdown populated from existing chores)
  - Schedule editor (morning/evening start/end times, validated for overlap)
  - Manual "Reset now" button (clears current window's completed map)

### Data model

Added to `AppConfig` in `src/contexts/ConfigContext.tsx`:

```ts
export interface BathroomItem {
    id: string;
    label: string;
    icon: string;              // lucide icon name
    assignedTo: string;        // kidId (references Kid from chores)
    timeSlot: 'morning' | 'evening' | 'both';
    linkedChoreId?: string;    // optional reference to a Chore
}

export interface BathroomSchedule {
    morningStart: string;  // "HH:mm"
    morningEnd: string;
    eveningStart: string;
    eveningEnd: string;
}

export interface BathroomConfig {
    items: BathroomItem[];
    schedule: BathroomSchedule;
}

// AppConfig gets:
bathroom?: BathroomConfig;
```

Defaults:
```ts
{
  items: [],
  schedule: {
    morningStart: '06:00',
    morningEnd: '10:00',
    eveningStart: '18:00',
    eveningEnd: '22:00'
  }
}
```

### Runtime state (server-side, separate from config)

Stored in `server/data/bathroom-state.json` (new file, gitignored like other
runtime data):

```ts
{
  currentWindow: 'morning' | 'evening' | 'none';
  windowStartedAt: number;          // epoch ms, anchor for reset detection
  completed: {
    [itemId: string]: {
      timestamp: number;
      linkedChoreCompletionId?: string;  // for undo
    }
  }
}
```

This is deliberately separate from `config.json` so config stays small and
the completion churn doesn't touch persistent config.

### API endpoints

All under the existing security middleware (require `x-device-id`).

**`GET /api/bathroom/state`**

Server computes active window from `schedule` + current time. If a window
transition happened since last call, it first resets `completed` to `{}`.

Response:
```json
{
  "currentWindow": "morning",
  "schedule": { ... },
  "items": [ ...BathroomItem ],  // filtered to items matching current window
  "completed": { "item-id": { "timestamp": 1717... } },
  "kids": [ ...Kid ],            // needed for avatar/color rendering
  "nextWindow": {
    "name": "evening",
    "startsAt": "18:00"
  }
}
```

When `currentWindow === 'none'`, `items` is empty; client renders clock screen.

**`POST /api/bathroom/toggle`**

Body: `{ itemId: string, action: 'complete' | 'uncomplete' }`

For `complete`:
1. Load state, detect window transition (same reset logic as GET).
2. Reject with 409 if `itemId` already in `completed[currentWindow]`.
3. Look up item by id. Reject 404 if not found or not in current window.
4. Add to `completed` with timestamp.
5. If `linkedChoreId` set: call existing `choreLogic.completeTask`
   server-internally (bypassing PIN since this is a server-trusted path),
   store returned completion ID.
6. Persist state. Return updated state snapshot.

For `uncomplete` (undo, only within 5-second client-side window but server
allows anytime within current window for robustness):
1. Remove from `completed`.
2. If `linkedChoreCompletionId` present: roll back the chore completion
   (reverse of star grant).
3. Persist, return state.

**`POST /api/bathroom/reset`** (admin-triggered)

Clears current window's `completed` map. Does NOT roll back stars that were
already granted — admin intent is "start the list over for the routine",
not "undo rewards". Documented in admin UI tooltip.

## UI — Echo Show 5 layout

**Active window:**

- Header (~40px): time-slot badge (Morgen/Abend), clock, "2 von 5" progress
  counter
- Flat list, ~80px rows. Per row: colored kid dot (12px) + lucide icon (32px)
  + label (24px) + check mark / empty state on right
- Completed rows: 50% opacity, strikethrough, green check
- Full row is tap target. Single tap = toggle complete. No confirmation
  dialog.
- Snackbar bottom-center for 5 seconds after toggle: "Rückgängig" button.
- Vertical scroll when >5 items.

**Outside active window:**

- Large centered clock
- Small caption: "Nächste Routine: [Morgen-Routine] um HH:mm"
- Dark background to reduce night glare.

**All done in current window:**

- Full-screen success state: big check, "Super, alles erledigt!", small list
  of completed items below. Persists until window transition.

**Auto-refresh:** Client polls `GET /api/bathroom/state` every 10 s to pick
up changes made from the dashboard or a second device.

## Integration with existing systems

- **Kids source:** `config.chores.kids` (reuse; do not duplicate).
- **Chores source:** `config.chores.tasks` (for `linkedChoreId` dropdown in
  admin).
- **Stars logic:** reuse `server/choreLogic.js` `completeTask` path. Add an
  optional "skip PIN check" internal flag or expose an internal function that
  the bathroom toggle can call directly.
- **Security:** existing `x-device-id` middleware. Echo registers on first
  visit like any other device, admin approves once.
- **Navigation:** optional tile in main dashboard nav; Echo uses direct URL
  bookmark.

## Error handling

| Case | Behavior |
| ---- | -------- |
| Device not approved | Existing 403 / AccessDenied page — no special handling |
| Network error on Echo | Toast "Keine Verbindung"; last known state stays; next poll retries |
| Duplicate toggle (race between two devices) | 409 from server; client silently reconciles to completed state |
| Invalid admin schedule (overlap / end-before-start) | Admin save blocked with inline error |
| State file corrupt / missing | Server recreates with empty `completed`, logs warning |
| Linked chore deleted after item created | Item's `linkedChoreId` becomes dangling; toggle still works but grants no stars; admin shows warning icon |

## Testing

- **Server integration:** standalone node script
  (`server/test/bathroom.test.js`, manually runnable, consistent with repo's
  current "no framework" stance) covering:
  - Window transition reset
  - Duplicate toggle → 409
  - Linked-chore star grant (mock chore)
  - Uncomplete rollback of stars
- **Manual test plan:** checklist in
  `docs/superpowers/specs/2026-04-21-bathroom-echo-testing.md` covering Echo
  happy path, offline behavior, window transition, admin CRUD, admin reset
  button.
- **No new test framework** introduced — the repo currently runs tests ad-hoc.

## Out of scope

- Voice/Alexa integration (not needed; Echo display is touch-only for this)
- Per-child login / profile switching (decided: combined list, no login)
- Historical completion reporting / analytics
- Push-notifications to other devices when a kid finishes
- Changes inside `music-assistant-pwa` beyond adding a link/button to the
  dashboard URL (delivered via a separate Claude-Code prompt)

## Open questions — none remaining

All design questions resolved during brainstorming.
