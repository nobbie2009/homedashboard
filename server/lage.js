/**
 * LAGE-Index – reine Bewertungslogik (ohne Netzwerk, ohne Dateisystem).
 *
 * Eigener, inoffizieller Indikator für die „Gefahr von außen“. Stufe 5 ist
 * normal, Stufe 1 akut. Stufe 1 lässt sich ausschließlich über amtliche
 * Warnungen bzw. Messwerte erreichen (Schicht A); die weichen Indikatoren
 * (Schicht B) heben den Index höchstens auf Stufe 2.
 *
 * Alle Funktionen hier sind deterministisch und werden in
 * server/test/lage.test.js geprüft.
 */

export const LEVELS = {
    5: { label: 'Normal', color: 'green' },
    4: { label: 'Auffällig', color: 'blue' },
    3: { label: 'Erhöht', color: 'yellow' },
    2: { label: 'Angespannt', color: 'orange' },
    1: { label: 'Akut', color: 'red' },
};

export const GROUPS = {
    luft: { label: 'Luft', weight: 1.0 },
    politik: { label: 'Politik', weight: 1.2 },
    oeffentlichkeit: { label: 'Öffentlichkeit', weight: 0.6 },
};

export const INDICATORS = {
    flugbereitschaft: { group: 'luft', label: 'Flugbereitschaft' },
    militaerluft: { group: 'luft', label: 'Militärluft Europa' },
    luftraum: { group: 'luft', label: 'Luftraum' },
    drohnen: { group: 'luft', label: 'Drohnen' },
    parlament: { group: 'politik', label: 'Parlament' },
    krisenstab: { group: 'politik', label: 'Krisenstab' },
    nato: { group: 'politik', label: 'NATO / Militär' },
    diplomatie: { group: 'politik', label: 'Diplomatie' },
    suchinteresse: { group: 'oeffentlichkeit', label: 'Suchinteresse' },
    eilmeldungen: { group: 'oeffentlichkeit', label: 'Eilmeldungen' },
};

export const THRESHOLDS = {
    groupCap: 6,
    activeGroupMin: 2,
    level4IndicatorMin: 2,
    level3Total: 5,
    level3Groups: 2,
    level2Total: 9,
    level2Groups: 3,
    newsHalfLifeHours: 24,
    newsMaxAgeHours: 72,
    baselineMinSamples: 72, // 3 Tage stündlicher Werte
    baselineDays: 30,
    improveAfterMinutes: 60,
    kontextFactor: 0.5,
};

// ---------------------------------------------------------------------------
// Statistik
// ---------------------------------------------------------------------------

export function meanStd(values) {
    const n = values.length;
    if (n === 0) return { mean: 0, std: 0, n: 0 };
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    return { mean, std: Math.sqrt(variance), n };
}

/** Abweichung in „Sigma“ mit Mindest-Streuung, damit kleine Zählwerte nicht explodieren. */
export function zScore(value, values, minStd = 1) {
    const { mean, std, n } = meanStd(values);
    return { z: (value - mean) / Math.max(std, minStd), mean, std, n };
}

export function pointsFromZ(z) {
    if (!Number.isFinite(z)) return 0;
    if (z >= 4.5) return 3;
    if (z >= 3) return 2;
    if (z >= 2) return 1;
    return 0;
}

// ---------------------------------------------------------------------------
// Nachrichten-Regeln (Tagesschau)
// ---------------------------------------------------------------------------

/**
 * Jede Regel prüft Titel + Dachzeile + ersten Satz. `all` = alle Muster
 * müssen passen. `floor` setzt zusätzlich eine Untergrenze (Schicht A),
 * aber nie strenger als Stufe 2 – Nachrichten sind keine amtliche Warnung.
 */
export const NEWS_RULES = [
    { id: 'luftraum-sperre', indicator: 'luftraum', points: 2,
        all: [/luftraum(?:\s+\S+){0,4}?\s+(?:gesperrt|geschlossen|geräumt)|(?:sperr|schließ)\w*\s+(?:\S+\s+){0,3}?luftraum|sperrung des luftraums|flugverbot|überflugverbot/i] },
    { id: 'luftraum-verletzung', indicator: 'luftraum', points: 2,
        all: [/luftraumverletzung|in den (?:\w+ )?luftraum eingedrungen|alarmrotte|abfangjäger (?:aufgestiegen|alarmiert)|kampfjets? aufgestiegen/i] },
    { id: 'drohnen', indicator: 'drohnen', points: 2,
        all: [/drohne/i, /flughafen|flugbetrieb|airport|bundeswehr|kaserne|stützpunkt|kraftwerk|industriepark/i] },
    { id: 'sondersitzung', indicator: 'parlament', points: 2,
        all: [/sondersitzung|außerordentliche sitzung/i, /bundestag|bundesrat|verteidigungsausschuss|parlament/i] },
    { id: 'sicherheitsrat', indicator: 'krisenstab', points: 2,
        all: [/nationale[nrs]? sicherheitsrat|krisenstab|gemeinsame[ns]? lagezentrum|krisensitzung/i] },
    { id: 'nato-art4', indicator: 'nato', points: 3,
        all: [/nato|nordatlantik|bündnis/i, /(?:artikel|art\.)\s*4\b/i, /beantrag|konsultation|einberuf|aktivier|ausgelöst/i] },
    { id: 'alarmbereitschaft', indicator: 'nato', points: 2,
        all: [/(?:erhöhte|höchste) alarmbereitschaft|in alarmbereitschaft versetzt|mobilmachung|teilmobilmachung|reservisten (?:werden )?einberufen/i] },
    { id: 'sondergipfel', indicator: 'diplomatie', points: 1,
        all: [/sondergipfel|krisengipfel|notfallgipfel|dringlichkeitssitzung/i] },
    { id: 'reise-abgesagt', indicator: 'diplomatie', points: 1,
        all: [/kanzler|verteidigungsminister|außenminister/i, /(?:reise|besuch)\w* (?:\S+ ){0,3}?(?:abgesagt|abgebrochen)|(?:sagt|bricht)\w*\s+(?:\S+\s+){0,2}?(?:reise|besuch)\S*(?:\s+\S+){0,4}?\s+ab\b/i] },
    // Rechtslage / Bündnisfall: zusätzlich Untergrenze Stufe 2
    { id: 'spannungsfall', indicator: 'nato', points: 3, floor: 2,
        all: [/(?:spannungsfall|verteidigungsfall)\s+(?:wurde\s+|ist\s+)?(?:festgestellt|ausgerufen|beschlossen)|feststellung des (?:spannungs|verteidigungs)falls/i] },
    { id: 'buendnisfall', indicator: 'nato', points: 3, floor: 2,
        all: [/bündnisfall\s+(?:wurde\s+|ist\s+)?(?:ausgerufen|festgestellt|erklärt)|(?:artikel|art\.)\s*5\s+(?:wurde\s+)?(?:aktiviert|ausgelöst|ausgerufen)/i] },
];

/** Allgemeine Sicherheitsthemen – nur für den Indikator „Eilmeldungen“. */
export const BREAKING_PATTERN = /nato|russland|militär|bundeswehr|angriff|rakete|drohne|luftraum|krieg|explosion|anschlag|terror|cyber|sabotage|evakuier|strahlung|atom/i;

export function newsText(item) {
    return [item.title, item.topline, item.firstSentence].filter(Boolean).join(' · ');
}

/** Liefert die Treffer (Regel-IDs) für eine Nachricht. */
export function matchNews(item) {
    const text = newsText(item);
    return NEWS_RULES.filter(rule => rule.all.every(re => re.test(text)));
}

/** Halbwertszeit-Abklingen. */
export function decay(points, ageHours, halfLife = THRESHOLDS.newsHalfLifeHours) {
    if (ageHours < 0) ageHours = 0;
    return points * Math.pow(0.5, ageHours / halfLife);
}

/**
 * Nachrichten-Ereignisse → Punkte je Indikator.
 * events: [{ indicator, points, breaking, ts, title, ruleId }]
 */
export function newsIndicatorPoints(events, now) {
    const result = {};
    for (const ev of events) {
        const ageH = (now - ev.ts) / 3600000;
        if (ageH > THRESHOLDS.newsMaxAgeHours) continue;
        const base = Math.min(3, ev.points + (ev.breaking ? 1 : 0));
        const p = decay(base, ageH);
        const r = (result[ev.indicator] ||= { points: 0, events: [] });
        r.points += p;
        r.events.push({ ...ev, decayed: round2(p) });
    }
    for (const r of Object.values(result)) {
        r.points = Math.min(3, r.points);
        r.events.sort((a, b) => b.decayed - a.decayed);
    }
    return result;
}

/** Untergrenzen aus Nachrichten (nur noch nicht abgelaufene, max. 72 h). */
export function newsFloors(events, now) {
    const floors = [];
    for (const ev of events) {
        if (!ev.floor) continue;
        if ((now - ev.ts) / 3600000 > THRESHOLDS.newsMaxAgeHours) continue;
        floors.push({ level: Math.max(2, ev.floor), source: 'Nachrichten', reason: ev.title });
    }
    return floors;
}

// ---------------------------------------------------------------------------
// Schicht A: amtliche Warnungen
// ---------------------------------------------------------------------------

export const NINA_SEVERE_PATTERN = /luftangriff|luftalarm|luftgefahr|rakete|flugkörper|schutz suchen|schutzraum|radioaktiv|radiolog|strahlung|kernkraft|atom|cbrn|chemisch|kampfstoff|verteidigungsfall|spannungsfall|militärisch|angriff|beschuss/i;

/** Provider einer NINA-Meldung aus ihrer ID (mow., kat., biw., pol., dwd., lhp.). */
export function ninaProvider(id = '') {
    const p = String(id).split('.')[0].toLowerCase();
    return { mow: 'MoWaS', kat: 'KATWARN', biw: 'BIWAPP', pol: 'Polizei', dwd: 'DWD', lhp: 'Hochwasser' }[p] || p.toUpperCase();
}

export function isWeatherProvider(id = '') {
    const p = String(id).split('.')[0].toLowerCase();
    return p === 'dwd' || p === 'lhp';
}

/** Lokale NINA-Meldung → Stufe (oder null, wenn rein informativ). */
export function ninaLocalLevel(w) {
    if (isWeatherProvider(w.id)) return null;
    if (NINA_SEVERE_PATTERN.test(`${w.headline || ''} ${w.title || ''}`)) return 1;
    switch ((w.severity || '').toLowerCase()) {
        case 'extreme': return 2;
        case 'severe': return 3;
        case 'moderate': return 4;
        default: return null;
    }
}

/** Bundesweite MoWaS-Meldung → Stufe 2 nur bei hoher Schwere + passendem Thema. */
export function ninaNationalLevel(w) {
    const sev = (w.severity || '').toLowerCase();
    if (sev !== 'extreme' && sev !== 'severe') return null;
    return NINA_SEVERE_PATTERN.test(`${w.headline || ''} ${w.title || ''}`) ? 2 : null;
}

/**
 * Strahlung: stations = [{ name, value, distanceKm }].
 * cfg = { warn, alarm, minStations }
 */
export function radiationLevel(stations, cfg = {}) {
    const warn = cfg.warn ?? 0.3;
    const alarm = cfg.alarm ?? 0.8;
    const minStations = cfg.minStations ?? 2;
    const overAlarm = stations.filter(s => s.value >= alarm);
    const overWarn = stations.filter(s => s.value >= warn);
    if (overAlarm.length >= minStations) return { level: 1, stations: overAlarm };
    if (overWarn.length >= minStations) return { level: 3, stations: overWarn };
    return { level: null, stations: [] };
}

// ---------------------------------------------------------------------------
// Gesamtbewertung
// ---------------------------------------------------------------------------

/**
 * indicators: { [id]: { points, ... } }
 * opts: { kontextActive: boolean }
 */
export function computeGroups(indicators, opts = {}) {
    const groups = {};
    for (const [gid, g] of Object.entries(GROUPS)) {
        groups[gid] = { id: gid, label: g.label, weight: g.weight, raw: 0, points: 0, active: false, indicators: [] };
    }
    for (const [iid, def] of Object.entries(INDICATORS)) {
        const ind = indicators[iid];
        const pts = ind ? Math.max(0, Math.min(3, ind.points || 0)) : 0;
        groups[def.group].raw += pts;
        groups[def.group].indicators.push(iid);
    }
    for (const g of Object.values(groups)) {
        let p = g.raw;
        if (opts.kontextActive && (g.id === 'luft' || g.id === 'politik')) p *= THRESHOLDS.kontextFactor;
        g.points = round2(Math.min(THRESHOLDS.groupCap, p));
        g.active = g.points >= THRESHOLDS.activeGroupMin;
    }
    return groups;
}

export function computeIndicatorLevel(indicators, groups) {
    const total = round2(Object.values(groups).reduce((s, g) => s + g.points * g.weight, 0));
    const activeGroups = Object.values(groups).filter(g => g.active).map(g => g.id);
    const art4 = (indicators.nato?.events || []).some(e => e.ruleId === 'nato-art4' && e.decayed >= 1.5);

    let level = 5;
    const reasons = [];

    // LAGE 4: ein einzelnes starkes Signal – die Öffentlichkeit allein zählt nicht.
    const strong = Object.entries(indicators).filter(([iid, ind]) =>
        INDICATORS[iid] && INDICATORS[iid].group !== 'oeffentlichkeit' && (ind.points || 0) >= THRESHOLDS.level4IndicatorMin);
    if (strong.length > 0) {
        level = 4;
        reasons.push(`Starkes Einzelsignal: ${strong.map(([iid]) => INDICATORS[iid].label).join(', ')}`);
    }
    if (total >= THRESHOLDS.level3Total && activeGroups.length >= THRESHOLDS.level3Groups) {
        level = 3;
        reasons.push(`Gesamtwert ${total} ≥ ${THRESHOLDS.level3Total} bei ${activeGroups.length} aktiven Gruppen`);
    }
    if ((total >= THRESHOLDS.level2Total && activeGroups.length >= THRESHOLDS.level2Groups) || art4) {
        level = 2;
        reasons.push(art4 ? 'NATO-Konsultation nach Artikel 4' : `Gesamtwert ${total} ≥ ${THRESHOLDS.level2Total}, alle Gruppen aktiv`);
    }
    return { level, total, activeGroups, reasons };
}

/**
 * Endstufe = strengste aus Indikatorstufe und amtlichen Untergrenzen.
 * floors: [{ level, source, reason }]
 */
export function combineLevels(indicatorLevel, floors) {
    let level = indicatorLevel;
    let decisive = null;
    for (const f of floors) {
        if (f.level < level) {
            level = f.level;
            decisive = f;
        }
    }
    return { level, decisive };
}

/**
 * Glättung: Verschlechterung sofort, Verbesserung erst, wenn die bessere
 * Stufe `improveAfterMinutes` lang stabil war.
 * prev: { level, since, pending: { level, since } | null }
 */
export function applyHysteresis(prev, computed, now, improveAfterMinutes = THRESHOLDS.improveAfterMinutes) {
    if (!prev || !prev.level) return { level: computed, since: now, pending: null };
    if (computed < prev.level) return { level: computed, since: now, pending: null };
    if (computed === prev.level) return { level: prev.level, since: prev.since, pending: null };
    // computed > prev.level → Verbesserung
    const pending = prev.pending && prev.pending.level === computed ? prev.pending : { level: computed, since: now };
    if (now - pending.since >= improveAfterMinutes * 60000) {
        return { level: computed, since: now, pending: null };
    }
    return { level: prev.level, since: prev.since, pending };
}

/**
 * Soll alarmiert werden? Alarmiert wird beim Übergang in die Alarmstufe und
 * bei jeder weiteren Verschlechterung – nicht wiederholt, solange die Lage
 * unverändert anhält. Fällt die Lage zurück und steigt innerhalb der
 * Sperrzeit erneut auf dieselbe Stufe, bleibt es ebenfalls still.
 * lastAlarm: { level, ts, resolvedAt? } | null
 */
export function shouldAlarm(level, minLevel, lastAlarm, now, cooldownHours = 6) {
    if (level > minLevel) return false;
    if (!lastAlarm) return true;
    if (level < lastAlarm.level) return true; // Eskalation
    if (!lastAlarm.resolvedAt) return false; // Lage hält unverändert an
    return now - lastAlarm.ts >= cooldownHours * 3600000;
}

/** Kontext-Ereignis aktiv? kontext: [{ from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }] */
export function activeKontext(kontext = [], now = Date.now()) {
    const today = berlinDate(now);
    return kontext.filter(k => k && k.from && k.to && k.from <= today && today <= k.to);
}

export function berlinDate(ts) {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(ts));
}

export function round2(x) {
    return Math.round(x * 100) / 100;
}

/** Platzhalter {titel}, {text}, {stufe}, {ansage} in Strings eines JSON-Objekts ersetzen. */
export function fillTemplate(value, vars) {
    if (typeof value === 'string') {
        return value.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    }
    if (Array.isArray(value)) return value.map(v => fillTemplate(v, vars));
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillTemplate(v, vars)]));
    }
    return value;
}
