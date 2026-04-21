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

export function computeActiveWindow(schedule, now = new Date()) {
    if (!schedule) return 'none';
    const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const inRange = (start, end) => start && end && hm >= start && hm < end;
    if (inRange(schedule.morningStart, schedule.morningEnd)) return 'morning';
    if (inRange(schedule.eveningStart, schedule.eveningEnd)) return 'evening';
    return 'none';
}

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
    candidates.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    return candidates[0] || null;
}
