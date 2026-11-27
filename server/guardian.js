/**
 * Jarvis-Guardian: Eskalationsstufe (0–5) aus Home Assistant lesen und an die
 * Dashboards verteilen. Nur lesend – hier wird in HA nichts ausgelöst.
 *
 * Konfiguration (config.json → guardian):
 *   enabled     – Anzeige aktiv (Standard: an)
 *   entityId    – Entity mit der Stufe; leer = automatisch suchen
 *   labels      – optionale Kurztexte je Stufe { "0": "…", … }
 */
import * as ha from './homeassistant.js';

const POLL_MS = 30 * 1000;
const DISCOVER_RETRY_MS = 10 * 60 * 1000;

/** Attribute, in denen ein Klartext zur Stufe stehen kann. */
const TEXT_ATTRS = ['beschreibung', 'description', 'bezeichnung', 'label', 'name_stufe', 'stufe_name',
    'stufenname', 'level_name', 'text', 'status', 'meldung', 'info'];
const LEVEL_ATTRS = ['stufe', 'level', 'eskalationsstufe', 'escalation_level'];

const NAME_PATTERN = /guardian|eskalation|escalation/i;

/** Stufe 0–5 aus einem Zustand wie "2", "2.0", "Stufe 2 – Wachsam" lesen. */
export function parseLevel(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 5 ? value : null;
    const s = String(value).trim();
    if (!s || /^(unknown|unavailable|none)$/i.test(s)) return null;
    const n = Number(s.replace(',', '.'));
    if (Number.isFinite(n)) return Number.isInteger(n) && n >= 0 && n <= 5 ? n : null;
    const m = s.match(/(?:^|[^\d])([0-5])(?!\d)/);
    return m ? Number(m[1]) : null;
}

/** Klartext zur Stufe: Attribut der Entity → Text des Zustands → eigene Beschriftung. */
export function describe(stateObj, level, labels = {}) {
    const attrs = stateObj?.attributes || {};
    for (const key of TEXT_ATTRS) {
        const v = typeof attrs[key] === 'string' ? attrs[key].trim() : '';
        if (v && !Number.isFinite(Number(v.replace(',', '.')))) return v;
    }
    const raw = String(stateObj?.state ?? '').trim();
    if (raw && !Number.isFinite(Number(raw.replace(',', '.')))) {
        // "Stufe 2 – Wachsam" → "Wachsam"
        const rest = raw.replace(/^\D*[0-5]\s*[-–:|·]?\s*/, '').trim();
        if (rest) return rest;
    }
    const own = labels?.[String(level)];
    return typeof own === 'string' && own.trim() ? own.trim() : null;
}

/** Stufe aus Zustand oder – falls der Zustand Text ist – aus einem Attribut lesen. */
export function levelOf(stateObj) {
    const direct = parseLevel(stateObj?.state);
    if (direct !== null) return direct;
    const attrs = stateObj?.attributes || {};
    for (const key of LEVEL_ATTRS) {
        const l = parseLevel(attrs[key]);
        if (l !== null) return l;
    }
    return null;
}

/** Kandidaten für die Guardian-Stufe aus allen HA-Zuständen, beste zuerst. */
export function findCandidates(states) {
    if (!Array.isArray(states)) return [];
    return states
        .filter(s => s && typeof s.entity_id === 'string')
        .filter(s => NAME_PATTERN.test(s.entity_id) || NAME_PATTERN.test(s.attributes?.friendly_name || ''))
        .map(s => {
            const level = levelOf(s);
            const domain = s.entity_id.split('.')[0];
            let score = 0;
            if (level !== null) score += 10;
            if (/stufe|level|eskalation|escalation/i.test(s.entity_id + ' ' + (s.attributes?.friendly_name || ''))) score += 5;
            if (/guardian/i.test(s.entity_id)) score += 2;
            if (['sensor', 'input_number', 'input_select', 'select', 'number', 'counter'].includes(domain)) score += 3;
            if (['automation', 'script', 'button', 'input_button'].includes(domain)) score -= 20;
            return {
                entityId: s.entity_id,
                name: s.attributes?.friendly_name || null,
                state: s.state,
                level,
                score,
            };
        })
        .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// Dienst
// ---------------------------------------------------------------------------

let deps = null; // { getConfig, broadcast }
let snapshot = null;
let discovered = null; // { entityId, at }
let timer = null;
let polling = false;

export function guardianConfig() {
    const cfg = deps?.getConfig()?.guardian || {};
    return {
        enabled: cfg.enabled !== false,
        entityId: typeof cfg.entityId === 'string' ? cfg.entityId.trim() : '',
        labels: cfg.labels && typeof cfg.labels === 'object' ? cfg.labels : {},
    };
}

async function resolveEntity(cfg) {
    if (cfg.entityId) return cfg.entityId;
    if (discovered?.entityId) return discovered.entityId;
    if (discovered && Date.now() - discovered.at < DISCOVER_RETRY_MS) return null;
    const states = await ha.getStates();
    const best = findCandidates(states).find(c => c.level !== null);
    discovered = { entityId: best?.entityId || null, at: Date.now() };
    if (best) console.log(`[Guardian] Entity automatisch gefunden: ${best.entityId}`);
    return discovered.entityId;
}

function same(a, b) {
    return a && b && a.level === b.level && a.description === b.description && a.error === b.error
        && a.entityId === b.entityId && a.enabled === b.enabled && a.since === b.since;
}

export async function poll() {
    if (polling) return snapshot;
    polling = true;
    const prev = snapshot;
    try {
        const cfg = guardianConfig();
        if (!cfg.enabled) {
            snapshot = { enabled: false, updatedAt: Date.now() };
        } else if (!ha.credentialStatus().configured) {
            snapshot = { enabled: true, level: null, error: 'Home Assistant ist nicht eingerichtet', updatedAt: Date.now() };
        } else {
            const entityId = await resolveEntity(cfg);
            if (!entityId) {
                snapshot = { enabled: true, level: null, error: 'Keine Guardian-Entity gefunden – bitte im Admin eintragen', updatedAt: Date.now() };
            } else {
                const s = await ha.getState(entityId);
                const level = levelOf(s);
                snapshot = {
                    enabled: true,
                    entityId,
                    autoDetected: !cfg.entityId,
                    name: s.attributes?.friendly_name || null,
                    level,
                    rawState: s.state,
                    description: level === null ? null : describe(s, level, cfg.labels),
                    labels: cfg.labels,
                    since: s.last_changed ? Date.parse(s.last_changed) : null,
                    error: level === null ? `Unerwarteter Zustand: ${s.state}` : null,
                    updatedAt: Date.now(),
                };
            }
        }
    } catch (e) {
        snapshot = { ...(prev || {}), enabled: true, error: e.message, updatedAt: Date.now() };
        if (/404/.test(e.message) && !guardianConfig().entityId) discovered = null;
    } finally {
        polling = false;
    }
    if (!same(prev, snapshot)) {
        if (prev && prev.level !== snapshot.level && snapshot.level !== undefined) {
            console.log(`[Guardian] Stufe ${prev.level ?? '–'} → ${snapshot.level ?? '–'}`);
        }
        deps?.broadcast('guardian', snapshot);
    }
    return snapshot;
}

export function getSnapshot() {
    return snapshot || { enabled: guardianConfig().enabled, loading: true, level: null, updatedAt: null };
}

/** Nach Konfigurationsänderung: Suche zurücksetzen und sofort neu lesen. */
export function reconfigure() {
    discovered = null;
    return poll();
}

export async function discover() {
    const states = await ha.getStates();
    return findCandidates(states).slice(0, 20);
}

export function initGuardianService(d) {
    deps = d;
    setTimeout(() => poll(), 5000);
    timer = setInterval(() => poll(), POLL_MS);
    return () => clearInterval(timer);
}
