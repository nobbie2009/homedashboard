# Bathroom Echo Checklist — Design

**Date:** 2026-04-21
**Target:** homedashboard (this repo) + music-assistant-pwa (separate repo, consumer-side)
**Status:** revised after spec review (2026-04-21)

## Goal

A dedicated "bathroom" subpage in homedashboard that serves as a touch-friendly
checklist for children's bathroom routines (brushing teeth, washing, combing
hair, etc.) on an Amazon Echo Show 5 (960×480) running via the
`music-assistant-pwa` project. Kids check off their tasks on the Echo; the
existing Chores/Stars system is loosely integrated for items that correspond
to configured chores.

## Decisions (confirmed in brainstorming)

- **Relationship to existing Chores:** Hybrid — bathroom items are their own
  data structure with optional `linkedChoreId` reference. Items without a
  link are pure checklist entries; items with a link trigger star-reward
  logic on complete.
- **Child identification on Echo:** Combined list with per-item kid
  assignment (avatar/color indicator). All kids see everything; each kid
  taps only their own items. No login step.
- **Time-of-day split:** Two fixed lists — morning and evening. Each item is
  tagged `morning | evening | both`. The Echo auto-shows the list matching
  the current time window.
- **Reset behavior:** Automatic reset at time-window boundary. Plus a manual
  "reset now" button in admin for edge cases.
- **Chore/Stars link:** Stars granted when an item with `linkedChoreId` is
  completed on the Echo. Server enforces "1x per time window per item" to
  prevent duplicate stars. **No PIN on the Echo** — this is an intentional
  policy change from the existing `/api/rewards/complete` flow; see
  "Security implications" below.
- **API vs. HTML:** HTML subpage (`/bathroom` route) rendered by
  homedashboard directly. Echo loads this route in its browser. No changes
  to music-assistant-pwa beyond a link/button.
- **Admin section:** Dedicated new "Bad" section in `AdminSettings`,
  separate from Chores.
- **Time window configuration:** Configurable in admin (initial defaults:
  morning 06:00–10:00, evening 18:00–22:00).
- **Outside-window display:** Clock-only screen, dark background.
- **Echo authentication:** Same device-gate as every other device — approve
  Echo once in admin via `x-device-id`. See "Echo onboarding" below for the
  practical flow.

## Architecture

### New route
- `/bathroom` — new React route under existing `MainLayout`/`SecurityGate`.
  Touch-optimized for Echo Show 5. Accessible from existing dashboard nav
  (optional tile) and directly via bookmarked URL on the Echo.

### New admin section
- `AdminSettings` gets a new "Bad" panel containing:
  - Item CRUD (label, icon, `assignedTo` kidId, `timeSlot`, optional
    `linkedChoreId` dropdown populated from existing chores)
  - Schedule editor (morning/evening start/end times; see "Schedule
    validation" below)
  - Manual "Reset current window" button — clears the current window's
    completed map. Does NOT revoke stars already granted; this is documented
    in a tooltip next to the button.

### Data model (config additions)

Added to `AppConfig` in `src/contexts/ConfigContext.tsx`:

```ts
export interface BathroomItem {
    id: string;
    label: string;
    icon: string;                             // lucide icon name
    assignedTo: string;                       // kidId (references Kid from chores)
    timeSlot: 'morning' | 'evening' | 'both';
    linkedChoreId?: string;                   // optional reference to a Chore
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

**Config merge update (important):** `ConfigContext.tsx` has a hand-rolled
per-key merge block (currently lines ~181–211). Implementation MUST add an
explicit `bathroom` merge branch there. Without it, loading config from
the backend will drop the bathroom block on every fetch.

### Runtime state (server-side)

Stored in `server/data/bathroom-state.json` (already covered by existing
`server/data/` gitignore rule — confirmed).

```ts
{
  currentWindow: 'morning' | 'evening' | 'none';
  windowStartedAt: number;                          // epoch ms
  completed: {
    [itemId: string]: {
      timestamp: number;
      window: 'morning' | 'evening';                // anchors the grant
      linkedChoreCompletionId?: string;             // for rollback
    }
  }
}
```

The per-entry `window` field is load-bearing: if a GET happens mid-window
after a restart (before the transition-detection code has re-fired), we can
still distinguish "this was granted in the current window" from "stale
data from last window".

### Shared star-grant helper (refactor of existing code)

The existing star-grant logic lives **inline** inside the
`POST /api/rewards/complete` handler in `server/index.js` (the current
implementation reads `appConfig.chores.tasks`, pushes to
`rewardsData.completions`, and updates `appConfig.rewards.kidStars` or
`sharedStars`). It is tightly coupled to `req`/`res` and the PIN check.

**Implementation step 0 — refactor:** extract the star-grant body into a
pure helper exported from `server/choreLogic.js`:

```js
// server/choreLogic.js
export function grantChoreStars(appConfig, rewardsData, { taskId, kidId, source }) {
    // Validates task + kid exist; builds completion entry with fields:
    //   { id, taskId, taskLabel, kidId, kidName, stars, timestamp, source, mode }
    // where `mode` is appConfig.rewards.mode at time of grant.
    // Pushes to rewardsData.completions; updates appConfig.rewards.kidStars
    // or sharedStars (based on current mode); returns { entry, rewards }.
    // Throws if task or kid not found.
    // `source` is 'chore' | 'bathroom' — stored for audit.
}

export function revokeChoreStars(appConfig, rewardsData, completionId) {
    // Looks up entry by id. Decrements the pot that was actually credited
    // (using the entry's persisted `mode` field, NOT current config mode —
    // this handles the case where admin flipped modes between grant and
    // revoke). Floor decrement at 0. Removes entry from completions.
    // Returns { rewards }. Silent no-op if entry not found.
}
```

The existing `/api/rewards/complete` route:
1. Still does the PIN check.
2. Then calls `grantChoreStars(..., { source: 'chore' })`.
3. Persists config + rewards via existing `fs.writeFileSync` and
   `saveRewardsData()`.

The new `/api/bathroom/toggle` route:
1. Has NO PIN check (policy decision, documented below).
2. Calls `grantChoreStars(..., { source: 'bathroom' })` when
   `linkedChoreId` is set.
3. Calls `revokeChoreStars(...)` on undo.

### API endpoints

All under the existing security middleware (require `x-device-id`).

**`GET /api/bathroom/state`**

Server computes active window from `schedule` + current time.
If a window transition happened since last call, it first resets
`completed` by removing entries whose `window` field differs from the
current window, then updates `currentWindow` + `windowStartedAt`.

Response:
```json
{
  "currentWindow": "morning",
  "schedule": { ... },
  "items": [ ...BathroomItem ],  // filtered to items matching current window
  "completed": { "item-id": { "timestamp": 1717..., "window": "morning" } },
  "kids": [ ...Kid ],
  "nextWindow": {
    "name": "evening",
    "startsAt": "18:00"
  }
}
```

When `currentWindow === 'none'`, `items` is empty; client renders clock
screen using `nextWindow` for the caption.

**`POST /api/bathroom/toggle`**

Body: `{ itemId: string, action: 'complete' | 'uncomplete' }`

For `complete`:
1. Load state, detect window transition (same reset logic as GET).
2. Reject `400` if `currentWindow === 'none'`.
3. Look up item. Reject `404` if not found.
4. Verify item's `timeSlot` matches current window (or is `'both'`).
   Reject `400` if not.
5. Reject `409` if `itemId` already in `completed` AND its stored
   `window` equals current window.
6. Add to `completed` with `{ timestamp: now, window: currentWindow }`.
7. If `linkedChoreId` set AND item assignedTo matches a real kid:
   call `grantChoreStars(...)`, store returned `entry.id` as
   `linkedChoreCompletionId`. If `grantChoreStars` throws (e.g. chore
   was deleted — dangling reference), log and continue without stars
   (item still marks complete). Server returns `linkedChoreWarning: true`
   in response.
8. Persist state + config + rewards. Return updated state snapshot.

For `uncomplete` (undo):
1. Entry must exist in `completed` and its `window` must equal current
   window (rejecting stale entries from previous window).
2. Additionally: reject if more than **30 seconds** have passed since
   `timestamp`. This is the server-enforced undo window; spec previously
   had a client/server divergence — this resolves it. 30 s is long enough
   to catch an accidental tap but short enough to prevent "claim reward,
   then undo it after parent leaves the room".
3. Remove from `completed`.
4. If `linkedChoreCompletionId` present: call `revokeChoreStars(...)`.
5. Persist, return state.

**`POST /api/bathroom/reset`** (admin-only — protected by admin PIN in body)

Clears `completed` for the current window. Does NOT roll back stars
already granted — reset means "start the routine list over", not "undo
rewards". Admin UI tooltip explains this.

### Reset timing — pull-based by design

The server does NOT run a timer for window transitions. Transitions are
detected on the next incoming `GET /api/bathroom/state` or `POST /toggle`.
Consequences:

- The Echo polls every 30 s (see "Auto-refresh" below), so in normal
  operation the transition is picked up within 30 s of the boundary.
- If nobody hits the API between 10:00 and 18:00, the morning items
  remain "completed" in state until the first evening-window request
  arrives — at which point they are cleared. No user-visible effect:
  anyone loading the page in the evening sees a fresh list.
- No cron / setInterval is added; this matches the existing
  `checkAndRotateChores` pattern which is also pull-triggered on config
  load.

### Schedule validation

Admin save rejects a schedule if:
- Any time isn't `HH:mm` format.
- `morningStart >= morningEnd` or `eveningStart >= eveningEnd` (evenings
  that cross midnight are **not supported in v1** — documented as a known
  limitation).
- Morning window overlaps evening window.
- **Gap between windows is allowed and intentional** — that's the
  clock-screen time.

### `timeSlot: 'both'` — intentional double grant

An item with `timeSlot: 'both'` AND `linkedChoreId` set grants stars in
BOTH the morning and evening window (once each per day, because each
window resets independently). This is intentional — "Zähne putzen" is a
real twice-a-day action and deserves stars twice. Admin UI shows an info
tooltip on the `timeSlot` selector explaining this for linked items.

## Security implications

- **No PIN for Echo completions.** The existing
  `/api/rewards/complete` requires the admin PIN precisely because kids
  could otherwise mint unlimited stars. The bathroom endpoint trades PIN
  for these server-side guardrails:
  1. Device must be approved (`x-device-id` middleware).
  2. Each item can grant stars at most once per time window (enforced by
     `completed[itemId].window` check).
  3. Only items with `linkedChoreId` grant stars at all.
  4. Undo window is 30 seconds — preventing "claim and erase" abuse.
- Admin tooltip in the new panel must surface this: *"Bad-Items mit
  Sterne-Verknüpfung vergeben Sterne ohne PIN — limitiert auf einmal pro
  Zeitfenster."*

## Echo onboarding

Practical first-time flow (the device-gate hasn't changed but deserves
calling out):

1. On the Echo, open the dashboard URL in the browser. The Echo registers
   itself and hits `AccessDenied` with its device-id shown.
2. From a comfortable device (phone / iPad / PC), open the dashboard
   admin and approve the Echo by its device-id in the Geräte panel.
3. Bookmark the `/bathroom` URL on the Echo. From then on it loads
   straight into the active list.

Tiny Echo touch keyboards are painful for entering admin PINs, so the
registration/approval step is explicitly done from another device.

## UI — Echo Show 5 layout

**Platzbudget notes:**
- Physical resolution 960×480, but Silk browser top chrome on Fire OS
  consumes ~40–50px that cannot be hidden unless the page is installed
  as PWA. Design targets the **clipped area (~960×430)**.
- Use fixed pixel heights — Echo Silk's `vh` behavior is unreliable.
- Optional later improvement: add a Web App Manifest to allow "add to
  home screen" install, recovering the chrome area. Out of scope for v1.

**Active window:**

```
┌──────────────────────────────────────────────────┐
│ 🌅 Morgen-Routine              07:24   2 von 5  │  ← Header 40px
├──────────────────────────────────────────────────┤
│ [●Max]  🪥  Zähne putzen             ✓          │  ← 4 rows × 88px
│ [●Max]  💧  Waschen                              │
│ [●Lia]  🪥  Zähne putzen                         │
│ [●Lia]  💇  Haare kämmen             ✓          │
└──────────────────────────────────────────────────┘  (40+352=392px)
```

- Header: time-slot badge + clock + "n von m" progress counter.
- 4 rows × 88px visible = 352px. Total with header 392px, comfortably
  inside the 430px clipped area.
- Per row: colored kid dot (12px) + lucide icon (32px) + label (24px
  bold) + check mark on right.
- Completed rows: 50% opacity, strikethrough, green check.
- Full row tappable (~88px tall × full width). Single tap = toggle.
- Snackbar bottom-center for 30 s after toggle: "Rückgängig" button.
  The countdown is derived from the server-returned `timestamp` on the
  toggle response (not from client `Date.now()`), so the snackbar closes
  exactly when the server would reject a late undo — avoiding skew
  between Silk's slow JS clock and the server.
- Vertical scroll when >4 items (native touch scroll).

**Dangling kid reference (kid was deleted):**
- Gray dot instead of colored; item label is shown; tapping still works
  (completes the item locally but skips star grant).
- Admin panel shows a warning icon next to the item until fixed.

**Outside active window:**
- Large centered clock (96px font).
- Caption: *"Nächste Routine: Morgen-Routine um HH:mm"*.
- Dark background.

**All done in current window:**
- Full-screen success state: big green check + "Super, alles
  erledigt!" + small list of abgehakten items below. Persists until
  window transition.

**Auto-refresh:** Client polls `GET /api/bathroom/state` every **30 s**
(reduced from original 10 s). This is plenty for multi-device sync. As
a future optimization, subscribe to the existing
`/api/stream/events` SSE channel and skip polling entirely — out of
scope for v1.

## Integration with existing systems

- **Kids source:** `config.chores.kids` (reuse).
- **Chores source:** `config.chores.tasks` (for `linkedChoreId` dropdown).
- **Stars logic:** shared helper `grantChoreStars` / `revokeChoreStars`
  in `server/choreLogic.js` (see "Shared star-grant helper" refactor).
- **Security:** existing `x-device-id` middleware unchanged.
- **Navigation:** optional tile in main dashboard nav; Echo uses direct
  URL bookmark.

## Error handling

| Case | Behavior |
| ---- | -------- |
| Device not approved | Existing 403 / AccessDenied — no special handling |
| Network error on Echo | Toast "Keine Verbindung"; last known state stays; next poll retries |
| Duplicate toggle (409) | Client silently reconciles UI to completed state |
| Toggle outside window | 400; Echo shouldn't allow this (shows clock screen) but server defends |
| Linked chore deleted | Item still toggles; no stars granted; response sets `linkedChoreWarning`; admin shows icon |
| Kid deleted while referenced | Gray dot in UI; no stars; admin flags item |
| Invalid schedule (overlap, end≤start) | Admin save blocked with inline error |
| State file corrupt / missing | Server recreates with empty `completed`, logs warning |
| Evening-across-midnight in schedule | Admin rejects; v1 limitation documented |

## Testing

- **Server integration:** standalone node script
  `server/test/bathroom.test.js`, manually runnable, consistent with
  repo's current "no framework" stance. Covers:
  - Window transition reset (mock clock via param)
  - Duplicate toggle → 409
  - `timeSlot: 'both'` — grant allowed in both windows
  - Linked-chore star grant via `grantChoreStars`
  - Uncomplete within 30 s → rollback via `revokeChoreStars`
  - Uncomplete after 30 s → rejected
  - Dangling `linkedChoreId` → toggle succeeds, warning returned
- **Manual test plan:** `docs/superpowers/specs/2026-04-21-bathroom-echo-testing.md`
  covering Echo happy path, offline behavior, window transition, admin
  CRUD, admin reset button, Silk browser chrome clipping.
- **No new test framework** introduced.

## Out of scope

- Voice/Alexa integration (not needed; Echo display is touch-only)
- Per-child login / profile switching
- Historical completion reporting / analytics
- Push notifications to other devices when a kid finishes
- SSE-based live updates (planned as v2 optimization)
- PWA install manifest for Echo (optional v2 for full-screen)
- Evening windows crossing midnight
- Admin cleanup on kid/chore deletion (dangling references handled
  gracefully at read time; no automatic repair)
- Changes inside `music-assistant-pwa` beyond adding a link/button
  (delivered via a separate Claude-Code prompt)

## Open questions — none remaining

All design questions resolved during brainstorming + spec review.
