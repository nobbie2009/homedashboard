/**
 * LAGE-Index – Dienst: holt die Quellen zeitgesteuert ab, führt den Verlauf
 * für die Normalwerte, berechnet die Stufe und alarmiert.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    LEVELS, GROUPS, INDICATORS, THRESHOLDS, zScore, pointsFromZ, NEWS_RULES,
    newsIndicatorPoints, newsFloors, ninaLocalLevel, ninaNationalLevel, ninaProvider,
    isWeatherProvider, radiationLevel, computeGroups, computeIndicatorLevel,
    combineLevels, applyHysteresis, shouldAlarm, activeKontext, fillTemplate,
    BREAKING_PATTERN, round2, BUNDESTAG_RULES, NATO_RULES, matchRules, parseIcsWeeks,
    inSitzungswoche, flightPatternPoints, berlinHour, berlinDate,
} from './lage.js';
import {
    fetchNinaLocal, fetchNinaNational, fetchRadiation, fetchMilitaryAircraft,
    analyseAircraft, fetchTagesschau, fetchWikiPageviews, DEFAULT_WIKI_ARTICLES, normalizeArs,
    fetchBundestag, fetchSitzungswochenIcs, fetchNato,
} from './lageSources.js';
import * as ha from './homeassistant.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, 'data', 'lage_state.json');

const TICK_MS = 5 * 60 * 1000;
const INTERVALS = {
    nina: 5 * 60 * 1000,
    air: 10 * 60 * 1000,
    news: 10 * 60 * 1000,
    radiation: 30 * 60 * 1000,
    wiki: 6 * 60 * 60 * 1000,
    bundestag: 15 * 60 * 1000,
    nato: 15 * 60 * 1000,
    sitzungswochen: 24 * 60 * 60 * 1000,
};
const LEARNING_MS = 3 * 24 * 3600000;
const SAMPLE_KEEP_MS = THRESHOLDS.baselineDays * 24 * 3600000;

export const DEFAULT_ARS = '160620000000'; // Landkreis Nordhausen

let deps = null; // { getConfig, broadcast, push, isAllowed, geocode }
let state = loadState();
let snapshot = null;
let running = false;
let timer = null;

function loadState() {
    try {
        const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
        return { samples: {}, events: [], seenNews: {}, sources: {}, data: {}, ...s };
    } catch {
        return { samples: {}, events: [], seenNews: {}, sources: {}, data: {}, hyst: null, lastAlarm: null };
    }
}

function saveState() {
    try {
        fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
        fs.writeFileSync(STATE_PATH, JSON.stringify(state));
    } catch (e) {
        console.error('[Lage] Zustand nicht gespeichert:', e.message);
    }
}

export function lageConfig() {
    const cfg = deps?.getConfig()?.lage || {};
    const alarm = cfg.alarm || {};
    return {
        enabled: cfg.enabled !== false,
        ars: cfg.ars || DEFAULT_ARS,
        lat: cfg.lat,
        lon: cfg.lon,
        radiationRadiusKm: cfg.radiationRadiusKm || 100,
        radiationWarn: cfg.radiationWarn || 0.3,
        radiationAlarm: cfg.radiationAlarm || 0.8,
        air: cfg.air || {},
        wikiArticles: Array.isArray(cfg.wikiArticles) && cfg.wikiArticles.length ? cfg.wikiArticles : DEFAULT_WIKI_ARTICLES,
        kontext: Array.isArray(cfg.kontext) ? cfg.kontext : [],
        manualLevel: [1, 2, 3, 4].includes(cfg.manualLevel) ? cfg.manualLevel : null,
        manualNote: cfg.manualNote || '',
        alarm: {
            enabled: alarm.enabled === true,
            minLevel: [1, 2, 3].includes(alarm.minLevel) ? alarm.minLevel : 2,
            cooldownHours: alarm.cooldownHours || 6,
            popup: alarm.popup !== false,
            push: alarm.push !== false,
            ha: {
                enabled: alarm.ha?.enabled === true,
                actions: Array.isArray(alarm.ha?.actions) ? alarm.ha.actions : [],
            },
        },
    };
}

async function resolveLocation(cfg) {
    if (Number.isFinite(cfg.lat) && Number.isFinite(cfg.lon)) return { lat: cfg.lat, lon: cfg.lon };
    const app = deps.getConfig();
    if (Number.isFinite(app.flights?.lat) && Number.isFinite(app.flights?.lon)) return { lat: app.flights.lat, lon: app.flights.lon };
    const place = await deps.geocode(app.weatherLocation);
    if (place) return { lat: place.lat, lon: place.lon };
    return { lat: 51.5, lon: 10.79 }; // Nordhausen
}

function due(key, now, force) {
    if (force) return true;
    const last = state.sources[key]?.attemptAt || 0;
    return now - last >= INTERVALS[key];
}

async function runSource(key, fn) {
    const now = Date.now();
    state.sources[key] = { ...(state.sources[key] || {}), attemptAt: now };
    try {
        await fn();
        state.sources[key] = { ...state.sources[key], ok: true, at: now, error: null };
    } catch (e) {
        console.warn(`[Lage] Quelle ${key} fehlgeschlagen:`, e.message);
        state.sources[key] = { ...state.sources[key], ok: false, error: e.message };
    }
}

function pushSample(key, ts, value) {
    const arr = (state.samples[key] ||= []);
    arr.push([ts, value]);
    const cutoff = ts - SAMPLE_KEEP_MS;
    while (arr.length && arr[0][0] < cutoff) arr.shift();
}

/** Abweichung des aktuellen Werts von den bisherigen Messungen. */
function baselineEval(key, value, now) {
    const arr = state.samples[key] || [];
    const history = arr.slice(0, -1).map(s => s[1]);
    const learning = !arr.length || now - arr[0][0] < LEARNING_MS;
    const z = zScore(value, history, 1);
    return {
        value,
        mean: round2(z.mean),
        std: round2(z.std),
        z: round2(z.z),
        samples: history.length,
        learning,
        points: learning ? 0 : pointsFromZ(z.z),
    };
}

// ---------------------------------------------------------------------------
// Abruf
// ---------------------------------------------------------------------------

/**
 * Meldungen gegen Regeln prüfen und neue Treffer als Ereignis ablegen.
 * `bonus(item, rule)` liefert Zusatzpunkte (z. B. außerhalb der Sitzungswoche).
 */
function addRuleEvents(items, rules, source, now, bonus = () => 0) {
    for (const item of items) {
        for (const rule of matchRules(item, rules)) {
            const key = `${source}|${item.id}|${rule.id}`;
            if (state.seenNews[key]) continue;
            state.seenNews[key] = now;
            const extra = bonus(item, rule);
            state.events.push({
                indicator: rule.indicator, ruleId: rule.id, source,
                points: Math.min(3, rule.points + extra), floor: rule.floor || null,
                breaking: !!item.breaking, ts: Math.min(now, item.date || now),
                title: extra ? `${item.title} (außerhalb der Sitzungswoche)` : item.title, url: item.url,
            });
        }
    }
}

function pruneEvents(now) {
    const cutoff = now - THRESHOLDS.newsMaxAgeHours * 3600000;
    state.events = state.events.filter(e => e.ts >= cutoff);
    for (const [k, ts] of Object.entries(state.seenNews)) {
        if (ts < now - 7 * 24 * 3600000) delete state.seenNews[k];
    }
}

async function collect(force = false) {
    const cfg = lageConfig();
    const now = Date.now();
    const loc = await resolveLocation(cfg);
    state.data.location = loc;
    const jobs = [];

    if (due('nina', now, force)) {
        jobs.push(runSource('nina', async () => {
            const [local, national] = await Promise.all([fetchNinaLocal(cfg.ars), fetchNinaNational()]);
            state.data.ninaLocal = local;
            state.data.ninaNational = national;
        }));
    }
    if (due('air', now, force)) {
        jobs.push(runSource('air', async () => {
            const ac = await fetchMilitaryAircraft();
            const a = analyseAircraft(ac, cfg.air);
            state.data.air = { ...a, at: now };
            pushSample('vip', now, a.vipCount);
            pushSample('watched', now, a.watchedCount);
            pushSample('watchedEast', now, a.watchedEastCount);
            pushSample('airlift', now, a.airliftCount);
        }));
    }
    if (due('news', now, force)) {
        jobs.push(runSource('news', async () => {
            const items = await fetchTagesschau();
            addRuleEvents(items, NEWS_RULES, 'Tagesschau', now);
            for (const item of items) {
                if (item.breaking && BREAKING_PATTERN.test(`${item.title} ${item.topline} ${item.firstSentence}`)) {
                    const key = `${item.id}|eil`;
                    if (!state.seenNews[key]) {
                        state.seenNews[key] = now;
                        state.events.push({
                            indicator: 'eilmeldungen', ruleId: 'eilmeldung', source: 'Tagesschau', points: 1, floor: null, breaking: false,
                            ts: Math.min(now, item.date || now), title: item.title, url: item.url,
                        });
                    }
                }
            }
            pruneEvents(now);
            state.data.newsCount = items.length;
        }));
    }
    let kalender = Promise.resolve();
    if (due('sitzungswochen', now, force) || !state.data.sitzungswochen?.length) {
        jobs.push(kalender = runSource('sitzungswochen', async () => {
            const texts = await fetchSitzungswochenIcs();
            const weeks = texts.flatMap(parseIcsWeeks);
            if (!weeks.length) throw new Error('Kalender ohne Sitzungswochen');
            state.data.sitzungswochen = weeks;
        }));
    }
    if (due('bundestag', now, force)) {
        jobs.push(runSource('bundestag', async () => {
            const items = await fetchBundestag();
            await kalender; // Bonus „außerhalb der Sitzungswoche“ braucht den Kalender
            const weeks = state.data.sitzungswochen || [];
            addRuleEvents(items, BUNDESTAG_RULES, 'Bundestag', now, (item, rule) =>
                rule.outsideWeekBonus && weeks.length && !inSitzungswoche(berlinDate(item.date || now), weeks) ? 1 : 0);
            pruneEvents(now);
            state.data.bundestagCount = items.length;
        }));
    }
    if (due('nato', now, force)) {
        jobs.push(runSource('nato', async () => {
            const items = await fetchNato();
            addRuleEvents(items, NATO_RULES, 'NATO', now);
            pruneEvents(now);
            state.data.natoCount = items.length;
        }));
    }
    if (due('radiation', now, force)) {
        jobs.push(runSource('radiation', async () => {
            const r = await fetchRadiation(loc.lat, loc.lon, cfg.radiationRadiusKm);
            state.data.radiation = {
                near: r.near.slice(0, 15).map(s => ({ name: s.name, value: s.value, distanceKm: s.distanceKm, end: s.end })),
                nearAll: r.near.map(s => ({ name: s.name, value: s.value, distanceKm: s.distanceKm })),
                nationwideOverAlarm: r.nationwide.filter(s => s.value >= cfg.radiationAlarm).map(s => ({ name: s.name, value: s.value })),
                stationsTotal: r.nationwide.length,
            };
        }));
    }
    if (due('wiki', now, force)) {
        jobs.push(runSource('wiki', async () => {
            const w = await fetchWikiPageviews(cfg.wikiArticles);
            state.data.wiki = { ...w, at: now };
        }));
    }
    await Promise.all(jobs);
}

// ---------------------------------------------------------------------------
// Bewertung
// ---------------------------------------------------------------------------

function evaluate() {
    const cfg = lageConfig();
    const now = Date.now();
    const indicators = {};
    for (const [id, def] of Object.entries(INDICATORS)) {
        indicators[id] = { id, label: def.label, group: def.group, points: 0, detail: '', events: [] };
    }

    // Luft – Flugbewegungen
    const air = state.data.air;
    if (air && state.sources.air?.ok) {
        // Flugbereitschaft: Abweichung (Regierungsflieger bzw. Lufttransport) + Muster
        const vip = baselineEval('vip', air.vipCount, now);
        const lift = baselineEval('airlift', air.airliftCount ?? 0, now);
        const hour = berlinHour(now);
        const pattern = flightPatternPoints({
            vipCount: air.vipCount,
            vipNight: hour < 5 ? air.vipCount : 0,
            vipEast: air.vipEastCount ?? 0,
        });
        const fbDetail = [
            `${air.vipCount} Regierungsflieger in der Luft (Normal ${vip.mean} ± ${vip.std})`,
            `${air.airliftCount ?? 0} A400M/C-130J (Normal ${lift.mean} ± ${lift.std})`,
        ];
        if (pattern.hits.length) fbDetail.push(`Muster: ${pattern.hits.join(', ')}`);
        Object.assign(indicators.flugbereitschaft, vip, {
            points: Math.min(3, Math.max(vip.points, lift.points) + pattern.points),
            z: Math.max(vip.z, lift.z),
            detail: fbDetail.join(' · '),
            list: [...air.vip, ...(air.airlift || [])],
            pattern: pattern.hits,
        });
        // Militärluft: Europa gesamt bzw. Ostflanke – der stärkere Ausschlag zählt
        const w = baselineEval('watched', air.watchedCount, now);
        const e = baselineEval('watchedEast', air.watchedEastCount ?? 0, now);
        let pts = Math.max(w.points, e.points);
        let detail = `${air.watchedCount} AWACS/Tanker/Aufklärer über Europa (Normal ${w.mean} ± ${w.std}) · davon ${air.watchedEastCount ?? 0} an der Ostflanke (Normal ${e.mean} ± ${e.std})`;
        if (air.doomsday?.length) {
            pts = 3;
            detail += ` · ${air.doomsday.length}× E-4B/E-6B in Europa!`;
        }
        Object.assign(indicators.militaerluft, w, { points: pts, z: Math.max(w.z, e.z), detail, byType: air.watchedByType, list: air.doomsday });
    }

    // Nachrichten
    const news = newsIndicatorPoints(state.events, now);
    for (const [id, r] of Object.entries(news)) {
        if (!indicators[id]) continue;
        const ind = indicators[id];
        ind.events = r.events.slice(0, 5).map(e => ({ title: e.title, url: e.url, ts: e.ts, decayed: e.decayed, breaking: e.breaking, ruleId: e.ruleId, source: e.source || 'Tagesschau' }));
        // Flug-Indikatoren behalten ihren Messwert, Nachrichten kommen dazu
        ind.points = Math.min(3, (ind.points || 0) + r.points);
        ind.detail = ind.detail ? `${ind.detail} · ${r.events.length} Meldung(en)` : `${r.events.length} Meldung(en) in 72 h`;
    }
    for (const id of ['luftraum', 'drohnen', 'parlament', 'krisenstab', 'nato', 'diplomatie', 'eilmeldungen']) {
        const anySource = state.sources.news?.ok || state.sources.bundestag?.ok || state.sources.nato?.ok;
        if (!indicators[id].detail) indicators[id].detail = anySource ? 'keine Meldungen' : 'keine Daten';
    }

    // Öffentlichkeit – Wikipedia
    const wiki = state.data.wiki;
    if (wiki?.series) {
        const arts = [];
        for (const [art, series] of Object.entries(wiki.series)) {
            if (series.length < 8) continue;
            const last = series[series.length - 1];
            const hist = series.slice(0, -1);
            const { mean, std } = zScore(last, hist);
            const z = (last - mean) / Math.max(std, mean * 0.15, 5);
            arts.push({ article: art, views: last, mean: Math.round(mean), z: round2(z) });
        }
        arts.sort((a, b) => b.z - a.z);
        const strong = arts.filter(a => a.z >= 3).length;
        let pts = pointsFromZ(arts[0]?.z ?? 0);
        if (strong >= 3) pts = 3;
        Object.assign(indicators.suchinteresse, {
            points: pts,
            detail: arts.length ? `Stärkster Ausschlag: ${arts[0].article.replace(/_/g, ' ')} (${arts[0].views} statt ~${arts[0].mean} Abrufe, ${arts[0].z}σ)` : 'keine Daten',
            articles: arts.slice(0, 8),
        });
    } else {
        indicators.suchinteresse.detail = 'noch keine Daten';
    }
    for (const ind of Object.values(indicators)) ind.points = round2(ind.points || 0);

    // Kontext / Gruppen / Indikatorstufe
    const kontext = activeKontext(cfg.kontext, now);
    const groups = computeGroups(indicators, { kontextActive: kontext.length > 0 });
    const il = computeIndicatorLevel(indicators, groups);

    // Schicht A – Untergrenzen
    const floors = [];
    const ninaLocal = (state.data.ninaLocal || []).map(w => ({ ...w, provider: ninaProvider(w.id), weather: isWeatherProvider(w.id), level: ninaLocalLevel(w) }));
    for (const w of ninaLocal) {
        if (w.level) floors.push({ level: w.level, source: `NINA ${w.provider}`, reason: w.headline || w.title });
    }
    const ninaNational = (state.data.ninaNational || [])
        .map(w => ({ ...w, level: ninaNationalLevel(w) }))
        .filter(w => w.level);
    for (const w of ninaNational) floors.push({ level: w.level, source: 'NINA bundesweit', reason: w.title });

    const rad = state.data.radiation;
    let radiation = null;
    if (rad) {
        const near = rad.nearAll || rad.near || [];
        const rl = radiationLevel(near, { warn: cfg.radiationWarn, alarm: cfg.radiationAlarm });
        const max = near.reduce((m, s) => (s.value > (m?.value ?? -1) ? s : m), null);
        radiation = { level: rl.level, max, stations: (rad.near || []).slice(0, 6), nationwideOverAlarm: rad.nationwideOverAlarm || [], count: near.length };
        if (rl.level) floors.push({ level: rl.level, source: 'BfS Strahlung', reason: `${rl.stations.length} Sonden ≥ ${rl.level === 1 ? cfg.radiationAlarm : cfg.radiationWarn} µSv/h` });
        if ((rad.nationwideOverAlarm || []).length >= 5) {
            floors.push({ level: 2, source: 'BfS Strahlung bundesweit', reason: `${rad.nationwideOverAlarm.length} Sonden ≥ ${cfg.radiationAlarm} µSv/h` });
        }
    }
    floors.push(...newsFloors(state.events, now));
    if (cfg.manualLevel) floors.push({ level: cfg.manualLevel, source: 'Manuell', reason: cfg.manualNote || 'manuell gesetzt' });

    const combined = combineLevels(il.level, floors);
    const hyst = applyHysteresis(state.hyst, combined.level, now);
    state.hyst = hyst;

    const level = hyst.level;
    const meta = LEVELS[level];
    const reasons = [];
    if (combined.decisive) reasons.push(`${combined.decisive.source}: ${combined.decisive.reason}`);
    reasons.push(...il.reasons);
    if (hyst.pending) reasons.push(`Entspannung auf LAGE ${hyst.pending.level} wird geprüft (60 min stabil)`);

    return {
        enabled: cfg.enabled,
        updatedAt: now,
        level,
        label: meta.label,
        color: meta.color,
        since: hyst.since,
        computedLevel: combined.level,
        indicatorLevel: il.level,
        decisive: combined.decisive,
        floors: floors.sort((a, b) => a.level - b.level),
        total: il.total,
        activeGroups: il.activeGroups,
        reasons,
        groups,
        indicators,
        official: {
            ars: normalizeArs(cfg.ars),
            ninaLocal: ninaLocal.filter(w => !w.weather),
            ninaLocalWeatherCount: ninaLocal.filter(w => w.weather).length,
            ninaNational,
            radiation,
            manual: cfg.manualLevel ? { level: cfg.manualLevel, note: cfg.manualNote } : null,
            sitzungswoche: (state.data.sitzungswochen || []).length
                ? inSitzungswoche(berlinDate(now), state.data.sitzungswochen)
                : null,
        },
        kontext,
        sources: Object.fromEntries(Object.entries(state.sources).map(([k, v]) => [k, { ok: v.ok, at: v.at || null, error: v.error || null }])),
        lastAlarm: state.lastAlarm || null,
        alarm: { enabled: cfg.alarm.enabled, minLevel: cfg.alarm.minLevel, haEnabled: cfg.alarm.ha.enabled },
        calc: {
            weights: Object.fromEntries(Object.entries(GROUPS).map(([k, g]) => [k, g.weight])),
            thresholds: THRESHOLDS,
        },
    };
}

// ---------------------------------------------------------------------------
// Alarmierung
// ---------------------------------------------------------------------------

function alarmTexts(snap, test = false) {
    const main = snap.decisive ? `${snap.decisive.source}: ${snap.decisive.reason}` : (snap.reasons[0] || 'mehrere Indikatoren');
    const titel = `${test ? 'TEST – ' : ''}LAGE ${snap.level} – ${snap.label}`;
    const text = `${main}. Eigene Einschätzung, keine amtliche Warnung – amtliche Hinweise (NINA) beachten.`;
    const ansage = `${test ? 'Dies ist ein Test. ' : 'Achtung. '}Lage-Index Stufe ${snap.level}, ${snap.label}. ${main}. Bitte Dashboard und offizielle Warnungen beachten.`;
    return { titel, text, ansage, stufe: snap.level, label: snap.label };
}

async function runHaAction(action, vars) {
    if (action.type === 'blink') {
        const entity = action.entity || 'light.unterschrankled';
        // Blinken läuft im Hintergrund weiter, damit andere Aktionen nicht warten.
        ha.blinkLight(entity, action.seconds || 30).catch(e => console.warn('[Lage] Blinken fehlgeschlagen:', e.message));
        return 'gestartet';
    }
    let data = {};
    if (action.data) {
        data = typeof action.data === 'string' ? JSON.parse(action.data) : action.data;
    }
    await ha.callService(action.service, fillTemplate(data, vars));
    return 'ok';
}

async function dispatchAlarm(snap, { test = false, channels = null } = {}) {
    const cfg = lageConfig();
    const vars = alarmTexts(snap, test);
    const id = `${snap.level}-${Date.now()}`;
    const results = [];
    const want = (ch) => !channels || channels.includes(ch);

    const payload = {
        id, test, level: snap.level, label: snap.label, color: snap.color,
        titel: vars.titel, text: vars.text, reasons: snap.reasons, decisive: snap.decisive, ts: Date.now(),
    };

    if (want('popup') && (cfg.alarm.popup || test)) {
        deps.broadcast('lage-alarm', payload);
        results.push({ channel: 'Dashboard-Popup', ok: true });
    }
    if (want('push') && cfg.alarm.enabled && cfg.alarm.push) {
        try {
            await deps.push.sendToAll({ title: vars.titel, body: vars.text, tag: 'lage', url: '/', requireInteraction: true }, deps.isAllowed);
            results.push({ channel: 'Web-Push', ok: true });
        } catch (e) {
            results.push({ channel: 'Web-Push', ok: false, error: e.message });
        }
    }
    if (want('ha') && cfg.alarm.enabled && cfg.alarm.ha.enabled) {
        await Promise.all(cfg.alarm.ha.actions.filter(a => a.enabled).map(async (a) => {
            try {
                const r = await runHaAction(a, vars);
                results.push({ channel: a.label || a.service, ok: true, info: r });
            } catch (e) {
                results.push({ channel: a.label || a.service, ok: false, error: e.message });
            }
        }));
    }
    console.log(`[Lage] Alarm ${test ? '(TEST) ' : ''}LAGE ${snap.level}:`, results.map(r => `${r.channel}=${r.ok ? 'ok' : r.error}`).join(', '));
    return { id, payload, results };
}

async function checkAlarm(snap) {
    const cfg = lageConfig();
    const now = Date.now();
    const last = state.lastAlarm;
    if (snap.level > cfg.alarm.minLevel) {
        if (last && !last.resolvedAt) state.lastAlarm = { ...last, resolvedAt: now };
        return;
    }
    if (!shouldAlarm(snap.level, cfg.alarm.minLevel, last, now, cfg.alarm.cooldownHours)) return;
    const r = await dispatchAlarm(snap);
    state.lastAlarm = { id: r.id, level: snap.level, ts: now, resolvedAt: null, payload: r.payload, results: r.results };
    snap.lastAlarm = state.lastAlarm;
}

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

export async function runCycle(force = false) {
    if (running) return snapshot;
    running = true;
    try {
        if (!lageConfig().enabled) {
            snapshot = { enabled: false, updatedAt: Date.now() };
            return snapshot;
        }
        await collect(force);
        const prevLevel = snapshot?.level;
        snapshot = evaluate();
        await checkAlarm(snapshot);
        saveState();
        deps.broadcast('lage', snapshot);
        if (prevLevel && prevLevel !== snapshot.level) {
            console.log(`[Lage] Stufe ${prevLevel} → ${snapshot.level} (${snapshot.reasons.join('; ')})`);
        }
        return snapshot;
    } catch (e) {
        console.error('[Lage] Zyklus fehlgeschlagen:', e);
        return snapshot;
    } finally {
        running = false;
    }
}

export function getSnapshot() {
    return snapshot || { enabled: lageConfig().enabled, loading: true, updatedAt: null };
}

/** Nur Bewertung neu rechnen (z. B. nach Konfigurationsänderung), ohne Abruf. */
export async function reevaluate() {
    if (!lageConfig().enabled || !snapshot || running) return;
    // Bewusste Änderungen (z. B. manuelle Stufe zurückgenommen) sofort übernehmen.
    state.hyst = null;
    snapshot = evaluate();
    await checkAlarm(snapshot);
    saveState();
    deps.broadcast('lage', snapshot);
}

export async function testAlarm(channels) {
    const snap = snapshot && snapshot.level ? { ...snapshot } : evaluate();
    // Für den Test so tun, als läge die Alarmstufe vor – die echte Stufe bleibt unberührt.
    const cfg = lageConfig();
    const testSnap = { ...snap, level: cfg.alarm.minLevel, label: LEVELS[cfg.alarm.minLevel].label, color: LEVELS[cfg.alarm.minLevel].color };
    return dispatchAlarm(testSnap, { test: true, channels });
}

export async function testHaAction(action) {
    const snap = snapshot && snapshot.level ? snapshot : { level: 2, label: LEVELS[2].label, reasons: [], decisive: null };
    const vars = alarmTexts({ ...snap, level: 2, label: LEVELS[2].label }, true);
    return runHaAction(action, vars);
}

export function initLageService(d) {
    deps = d;
    // Erster Lauf leicht verzögert, damit der Serverstart nicht blockiert.
    setTimeout(() => runCycle(false), 15000);
    timer = setInterval(() => runCycle(false), TICK_MS);
    return () => clearInterval(timer);
}

export { ha };
