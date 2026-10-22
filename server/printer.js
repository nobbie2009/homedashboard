/**
 * Küchendrucker (Fichero 3561, 384 Punkte Thermodruck, Bluetooth).
 *
 * Der Drucker hängt per Bluetooth am Küchen-Pi. Dort läuft
 * `pocket-printer.service` mit einer kleinen HTTP-API (nur Heimnetz):
 *
 *   GET  /status          Druckerstatus
 *   POST /einkaufszettel  {entity?, title?}            -> {gedruckt: [...]}
 *   POST /zettel          {title, untertitel, zeilen, kaestchen}
 *   POST /text            {text, label?}
 *
 * Fehler kommen als HTTP 500 mit {fehler: "..."}. Der Pi druckt immer nur
 * einen Auftrag gleichzeitig, ein Druck dauert ca. 4 s.
 *
 * Der Dashboard-Server spricht den Pi direkt an, damit die Tablets nichts
 * vom Drucker wissen müssen und die Kalenderlogik hier bleibt.
 */

export const DEFAULT_PRINTER_URL = 'http://192.168.178.178:8765';
const REQUEST_TIMEOUT_MS = 30000;
const TIME_ZONE = 'Europe/Berlin';
/** Grobe Zeichenbreite einer Zeile für den /text-Rückfall. */
const FALLBACK_LINE_WIDTH = 32;

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function printerUrl(config = {}) {
    const url = config.printer?.url || process.env.PRINTER_URL || DEFAULT_PRINTER_URL;
    return url.replace(/\/+$/, '');
}

export class PrinterError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

async function call(config, method, pfad, daten) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res;
    try {
        res = await fetch(`${printerUrl(config)}${pfad}`, {
            method,
            headers: daten ? { 'Content-Type': 'application/json' } : undefined,
            body: daten ? JSON.stringify(daten) : undefined,
            signal: controller.signal,
        });
    } catch (e) {
        const grund = e.name === 'AbortError' ? 'Zeitüberschreitung' : e.message;
        throw new PrinterError(`Küchendrucker nicht erreichbar (${grund})`, 502);
    } finally {
        clearTimeout(timer);
    }

    let body = {};
    try { body = await res.json(); } catch { /* leere Antwort */ }

    if (!res.ok) {
        throw new PrinterError(body.fehler || body.error || `Drucker meldet HTTP ${res.status}`, res.status);
    }
    return body;
}

export function getStatus(config) {
    return call(config, 'GET', '/status');
}

export function printShoppingList(config) {
    const daten = {};
    if (config.printer?.todoEntity) daten.entity = config.printer.todoEntity;
    if (config.printer?.shoppingTitle) daten.title = config.printer.shoppingTitle;
    return call(config, 'POST', '/einkaufszettel', daten);
}

/**
 * Allgemeiner Zettel. Ältere Pi-Versionen kennen `/zettel` noch nicht (404),
 * dann geht derselbe Inhalt als Fließtext an `/text`.
 */
export async function printSlip(config, zettel) {
    try {
        return await call(config, 'POST', '/zettel', zettel);
    } catch (e) {
        if (e.status !== 404) throw e;
        console.warn('[Drucker] /zettel unbekannt, nutze /text als Rückfall');
        return call(config, 'POST', '/text', { text: slipAsText(zettel) });
    }
}

export function slipAsText({ title, untertitel, zeilen }) {
    const out = [];
    if (title) out.push(title.toUpperCase());
    if (untertitel) out.push(untertitel);
    out.push('-'.repeat(FALLBACK_LINE_WIDTH));
    for (const z of zeilen) out.push(...wrap(z, FALLBACK_LINE_WIDTH));
    return out.join('\n');
}

/** Bricht an Wortgrenzen um, Fortsetzungszeilen werden eingerückt. */
export function wrap(line, width) {
    if (line.length <= width) return [line];
    const indent = line.match(/^\s*/)[0];
    const words = line.trim().split(/\s+/);
    const lines = [];
    let current = indent;
    for (const word of words) {
        const candidate = current.trim() ? `${current} ${word}` : `${current}${word}`;
        if (candidate.length > width && current.trim()) {
            lines.push(current);
            current = `${indent}  ${word}`;
        } else {
            current = candidate;
        }
    }
    if (current.trim()) lines.push(current);
    return lines;
}

// --- Terminliste ---

/** Kalenderdatum (Y-M-D) eines Zeitpunkts in Berliner Zeit. */
function berlinParts(date) {
    const parts = new Intl.DateTimeFormat('de-DE', {
        timeZone: TIME_ZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date);
    const get = (t) => parts.find(p => p.type === t)?.value;
    return { y: +get('year'), m: +get('month'), d: +get('day'), time: `${get('hour')}:${get('minute')}` };
}

const dayKey = ({ y, m, d }) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function dayLabel(key) {
    const [y, m, d] = key.split('-').map(Number);
    const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return `${wd} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.`;
}

function addDaysToKey(key, n) {
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dayKey({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });
}

/**
 * Darf ein Kalender auf den Zettel? Eigener Scope `print`; solange der nicht
 * gesetzt ist, gilt die Sichtbarkeit in der Wochenansicht.
 */
export function printableCalendars(config) {
    const selected = config.google?.selectedCalendars || [];
    const settings = config.google?.calendarSettings || {};
    return selected.filter(id => {
        const scopes = settings[id]?.scopes;
        if (!scopes) return true;
        if (typeof scopes.print === 'boolean') return scopes.print;
        return scopes.weekView !== false;
    });
}

/**
 * Baut die Zeilen der Terminliste aus rohen Google-Events.
 *
 * Datenschutz: Der Zettel liegt offen in der Küche, deshalb nur Uhrzeit,
 * Titel und Kalendername — keine Beschreibung, kein Ort.
 *
 * @param events  Google-Events ({summary, start, end, calendarId})
 * @param from    erster Tag (YYYY-MM-DD, Berliner Zeit)
 * @param days    Anzahl Tage
 */
export function buildAgendaLines(events, config, from, days) {
    const settings = config.google?.calendarSettings || {};
    const keys = Array.from({ length: days }, (_, i) => addDaysToKey(from, i));
    const byDay = new Map(keys.map(k => [k, []]));

    for (const ev of events) {
        const alias = settings[ev.calendarId]?.alias;
        const title = (ev.summary || 'Termin').replace(/\s+/g, ' ').trim();
        const suffix = alias ? ` (${alias})` : '';

        if (ev.start?.date && !ev.start?.dateTime) {
            // Ganztägig, Enddatum ist exklusiv — mehrtägige an jedem Tag zeigen.
            const end = ev.end?.date || addDaysToKey(ev.start.date, 1);
            for (const k of keys) {
                if (k >= ev.start.date && k < end) {
                    byDay.get(k).push({ sort: '', text: `${title}${suffix}` });
                }
            }
            continue;
        }

        const start = new Date(ev.start?.dateTime);
        if (Number.isNaN(start.getTime())) continue;
        const p = berlinParts(start);
        const list = byDay.get(dayKey(p));
        if (list) list.push({ sort: p.time, text: `${p.time} ${title}${suffix}` });
    }

    const zeilen = [];
    for (const k of keys) {
        const entries = byDay.get(k);
        if (!entries.length) continue;
        entries.sort((a, b) => a.sort.localeCompare(b.sort) || a.text.localeCompare(b.text));
        if (zeilen.length) zeilen.push('');
        zeilen.push(dayLabel(k));
        for (const e of entries) zeilen.push(`  ${e.text}`);
    }
    return zeilen;
}

/** Untertitel wie "Mo 26.10. – So 01.11." */
export function rangeLabel(from, days) {
    const first = dayLabel(from);
    if (days <= 1) return first;
    return `${first} – ${dayLabel(addDaysToKey(from, days - 1))}`;
}

export function todayKey(now = new Date()) {
    return dayKey(berlinParts(now));
}

/** Mitternacht (Berliner Zeit) eines Tages als ISO-String. */
export function berlinMidnightIso(key) {
    const [y, m, d] = key.split('-').map(Number);
    // Offset über den Mittag des Tages bestimmen, damit Sommerzeit passt.
    const noon = new Date(Date.UTC(y, m - 1, d, 12));
    const p = berlinParts(noon);
    const offsetH = Number(p.time.slice(0, 2)) - 12;
    return new Date(Date.UTC(y, m - 1, d, -offsetH)).toISOString();
}
