/**
 * LAGE-Index – Datenquellen. Alle Abrufe sind reine Lesezugriffe auf
 * öffentliche, kostenlose Schnittstellen ohne API-Key.
 */

const UA = 'FamilyHub-Dashboard/1.0 (private home dashboard; LAGE-Index)';
const TIMEOUT_MS = 20000;

async function getJson(url, { timeout = TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': UA, 'Api-User-Agent': UA, Accept: 'application/json' },
            signal: controller.signal,
            redirect: 'follow',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('Zeitüberschreitung');
        throw e;
    } finally {
        clearTimeout(t);
    }
}

async function getText(url, { timeout = TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal, redirect: 'follow' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('Zeitüberschreitung');
        throw e;
    } finally {
        clearTimeout(t);
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const toRad = (d) => (d * Math.PI) / 180;
export function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ---------------------------------------------------------------------------
// NINA (BBK)
// ---------------------------------------------------------------------------

/** ARS auf Kreisebene bringen: die letzten 7 Stellen müssen 0 sein. */
export function normalizeArs(ars) {
    const digits = String(ars || '').replace(/\D/g, '');
    if (digits.length < 5) return null;
    return digits.slice(0, 5).padEnd(12, '0');
}

export async function fetchNinaLocal(ars) {
    const code = normalizeArs(ars);
    if (!code) throw new Error('Kein gültiger Regionalschlüssel (ARS)');
    const data = await getJson(`https://warnung.bund.de/api31/dashboard/${code}.json`);
    return (Array.isArray(data) ? data : []).map(w => ({
        id: w.id || w.payload?.id,
        headline: w.payload?.data?.headline || '',
        title: w.i18nTitle?.de || '',
        severity: w.payload?.data?.severity || '',
        msgType: w.payload?.data?.msgType || '',
        sent: w.sent || null,
    }));
}

export async function fetchNinaNational() {
    const data = await getJson('https://warnung.bund.de/api31/mowas/mapData.json');
    return (Array.isArray(data) ? data : []).map(w => ({
        id: w.id,
        title: w.i18nTitle?.de || '',
        severity: w.severity || '',
        type: w.type || '',
        sent: w.startDate || null,
    }));
}

// ---------------------------------------------------------------------------
// BfS – Ortsdosisleistung (ODL)
// ---------------------------------------------------------------------------

export async function fetchRadiation(lat, lon, radiusKm = 100) {
    const url = 'https://www.imis.bfs.de/ogc/opendata/ows?service=WFS&version=1.1.0&request=GetFeature'
        + '&typeName=opendata:odlinfo_odl_1h_latest&outputFormat=application/json';
    const data = await getJson(url, { timeout: 40000 });
    const all = (data.features || [])
        .filter(f => f.properties?.site_status === 1 && typeof f.properties?.value === 'number')
        .map(f => ({
            id: f.properties.id,
            name: f.properties.name,
            value: f.properties.value,
            end: f.properties.end_measure,
            lat: f.geometry?.coordinates?.[1],
            lon: f.geometry?.coordinates?.[0],
        }));
    const near = all
        .map(s => ({ ...s, distanceKm: Math.round(distanceKm(lat, lon, s.lat, s.lon)) }))
        .filter(s => s.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    return { near, nationwide: all };
}

// ---------------------------------------------------------------------------
// ADS-B: Militärflugzeuge (adsb.lol /v2/mil, weltweit)
// ---------------------------------------------------------------------------

export const DEFAULT_AIR = {
    // Flugbereitschaft der Luftwaffe: Callsign GAF… bzw. Kennzeichen 10+/14+/15+/16+
    vipCallsignPrefixes: ['GAF'],
    vipRegPrefixes: ['10+', '14+', '15+', '16+'],
    // AWACS, Tanker, Aufklärer, Seeaufklärer
    watchTypes: ['E3TF', 'E3CF', 'E737', 'K35R', 'K35E', 'KC46', 'A332', 'A339', 'R135', 'Q4', 'P8', 'E8'],
    // „Doomsday Planes“ – in Europa sofort 3 Punkte
    doomsdayTypes: ['E4B', 'B742', 'E6'],
    // Lufttransport der Luftwaffe (A400M 54+…, C-130J 55+…) – Evakuierung/Verlegung
    airliftRegPrefixes: ['54+', '55+'],
    // Europa grob
    bbox: { minLat: 34, maxLat: 72, minLon: -25, maxLon: 45 },
    // NATO-Ostflanke: Baltikum, Polen, Slowakei, Ungarn, Rumänien, Schwarzes Meer
    eastBox: { minLat: 43, maxLat: 60, minLon: 18, maxLon: 32 },
};

export async function fetchMilitaryAircraft() {
    let data;
    try {
        data = await getJson('https://api.adsb.lol/v2/mil');
    } catch (e) {
        // Ersatzquelle mit gleichem Format
        data = await getJson('https://api.airplanes.live/v2/mil');
    }
    return Array.isArray(data.ac) ? data.ac : [];
}

const trimCs = (s) => String(s || '').trim();

export function analyseAircraft(ac, cfg = {}) {
    const c = {
        ...DEFAULT_AIR, ...cfg,
        bbox: { ...DEFAULT_AIR.bbox, ...(cfg.bbox || {}) },
        eastBox: { ...DEFAULT_AIR.eastBox, ...(cfg.eastBox || {}) },
    };
    const inBox = (a, b) => a.lat >= b.minLat && a.lat <= b.maxLat && a.lon >= b.minLon && a.lon <= b.maxLon;
    const airborne = ac.filter(a => typeof a.lat === 'number' && typeof a.lon === 'number' && a.alt_baro !== 'ground');
    const inEurope = (a) => a.lat >= c.bbox.minLat && a.lat <= c.bbox.maxLat && a.lon >= c.bbox.minLon && a.lon <= c.bbox.maxLon;
    const short = (a) => ({ cs: trimCs(a.flight) || null, reg: a.r || null, type: a.t || null, lat: Math.round(a.lat * 100) / 100, lon: Math.round(a.lon * 100) / 100 });

    const isAirlift = (a) => c.airliftRegPrefixes.some(p => String(a.r || '').startsWith(p));
    const vip = airborne.filter(a => {
        if (isAirlift(a)) return false; // A400M/C-130J fliegen ebenfalls als „GAF…“
        const cs = trimCs(a.flight).toUpperCase();
        const reg = String(a.r || '');
        return c.vipCallsignPrefixes.some(p => cs.startsWith(p) && /\d/.test(cs.slice(p.length)))
            || c.vipRegPrefixes.some(p => reg.startsWith(p));
    });
    const watched = airborne.filter(a => inEurope(a) && c.watchTypes.includes(a.t));
    const watchedEast = watched.filter(a => inBox(a, c.eastBox));
    const vipEast = vip.filter(a => inBox(a, c.eastBox));
    const airlift = airborne.filter(isAirlift);
    const doomsday = airborne.filter(a => inEurope(a) && c.doomsdayTypes.includes(a.t));

    const byType = {};
    for (const a of watched) byType[a.t] = (byType[a.t] || 0) + 1;

    return {
        vipCount: vip.length,
        vip: vip.map(short),
        vipEastCount: vipEast.length,
        airliftCount: airlift.length,
        airlift: airlift.slice(0, 15).map(short),
        watchedEastCount: watchedEast.length,
        watchedCount: watched.length,
        watchedByType: byType,
        watched: watched.slice(0, 30).map(short),
        doomsday: doomsday.map(short),
        totalMil: ac.length,
    };
}

// ---------------------------------------------------------------------------
// Tagesschau
// ---------------------------------------------------------------------------

export async function fetchTagesschau() {
    const urls = [
        'https://www.tagesschau.de/api2u/homepage',
        'https://www.tagesschau.de/api2u/news?ressort=inland',
        'https://www.tagesschau.de/api2u/news?ressort=ausland',
    ];
    const seen = new Map();
    let ok = 0;
    for (const url of urls) {
        try {
            const d = await getJson(url);
            ok++;
            for (const n of d.news || []) {
                const id = n.sophoraId || n.externalId || n.title;
                if (!id || seen.has(id)) continue;
                seen.set(id, {
                    id,
                    title: n.title || '',
                    topline: n.topline || '',
                    firstSentence: n.firstSentence || '',
                    date: n.date ? Date.parse(n.date) : Date.now(),
                    breaking: n.breakingNews === true,
                    url: n.shareURL || n.detailsweb || null,
                });
            }
        } catch (e) {
            // einzelne Ressorts dürfen fehlen
        }
    }
    if (ok === 0) throw new Error('Tagesschau nicht erreichbar');
    return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Wikipedia-Abrufzahlen
// ---------------------------------------------------------------------------

export const DEFAULT_WIKI_ARTICLES = [
    'Verteidigungsfall', 'Spannungsfall', 'Schutzraum', 'Kaliumiodid', 'Jodtablette',
    'Sirene', 'Luftschutzbunker', 'Mobilmachung', 'Wehrpflicht_in_Deutschland',
    'Nordatlantikvertrag', 'Cell_Broadcast', 'Notvorrat', 'Stromausfall', 'Bündnisfall',
];

const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

/** Tageswerte der letzten ~31 Tage pro Artikel (sequenziell, gedrosselt). */
export async function fetchWikiPageviews(articles = DEFAULT_WIKI_ARTICLES) {
    const end = new Date(Date.now() - 24 * 3600000);
    const start = new Date(end.getTime() - 31 * 24 * 3600000);
    const result = {};
    const errors = [];
    for (const raw of articles) {
        const title = encodeURIComponent(String(raw).trim().replace(/ /g, '_'));
        if (!title) continue;
        const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/de.wikipedia/all-access/user/${title}/daily/${ymd(start)}/${ymd(end)}`;
        try {
            const d = await getJson(url);
            result[raw] = (d.items || []).map(i => i.views);
        } catch (e) {
            errors.push(`${raw}: ${e.message}`);
        }
        await sleep(1200);
    }
    if (Object.keys(result).length === 0) throw new Error(errors[0] || 'Keine Daten');
    return { series: result, errors };
}

// ---------------------------------------------------------------------------
// Bundestag
// ---------------------------------------------------------------------------

const decodeEntities = (t) => String(t || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Minimaler RSS-Parser (title, link, description, Datum). */
export function parseRss(xml) {
    const items = [];
    for (const m of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const tag = (name) => {
            const r = m[1].match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
            return r ? decodeEntities(r[1]) : '';
        };
        const date = Date.parse(tag('dc:date') || tag('pubDate'));
        items.push({
            id: tag('guid') || tag('link') || tag('title'),
            title: tag('title'),
            topline: '',
            firstSentence: tag('description').slice(0, 400),
            date: Number.isFinite(date) ? date : Date.now(),
            url: tag('link') || null,
            breaking: false,
        });
    }
    return items;
}

export const BUNDESTAG_FEEDS = [
    'https://www.bundestag.de/static/appdata/includes/rss/hib.rss',
    'https://www.bundestag.de/static/appdata/includes/rss/aktuellethemen.rss',
    'https://www.bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss',
];

export async function fetchBundestag() {
    const seen = new Map();
    let ok = 0;
    for (const url of BUNDESTAG_FEEDS) {
        try {
            const items = parseRss(await getText(url));
            ok++;
            for (const it of items) if (!seen.has(it.id)) seen.set(it.id, it);
        } catch { /* einzelner Feed darf fehlen */ }
    }
    if (ok === 0) throw new Error('Bundestag-Feeds nicht erreichbar');
    return [...seen.values()];
}

/** Sitzungswochen: ICS-Links von der Sitzungskalender-Seite lesen und laden. */
export async function fetchSitzungswochenIcs() {
    const page = await getText('https://www.bundestag.de/parlament/plenum/sitzungskalender');
    const links = [...new Set([...page.matchAll(/href="([^"]+\.ics)"/g)].map(m => m[1]))];
    if (!links.length) throw new Error('Kein Sitzungskalender (.ics) gefunden');
    const texts = [];
    for (const l of links) {
        const url = l.startsWith('http') ? l : `https://www.bundestag.de${l}`;
        try { texts.push(await getText(url)); } catch { /* nächster */ }
    }
    if (!texts.length) throw new Error('Sitzungskalender nicht ladbar');
    return texts;
}

// ---------------------------------------------------------------------------
// NATO (Such-Schnittstelle der Website: News + Media Advisories)
// ---------------------------------------------------------------------------

const NATO_LISTS = [
    'articles/news',
    'events/media-advisories',
];

export async function fetchNato() {
    const items = [];
    let ok = 0;
    for (const list of NATO_LISTS) {
        const url = `https://www.nato.int/content/nato/en/news-and-events/${list}/jcr:content/root/container/general_search.search.json`
            + '?searchText=&searchType=wcm&sortBy=dateDesc&pageSize=25&page=1&urlTags=&selectedTagsFilter=&languages=&startDate=&endDate=';
        try {
            const d = await getJson(url, { timeout: 30000 });
            ok++;
            for (const p of d.pages || []) {
                const date = Date.parse(p.pageDate);
                items.push({
                    id: p.link || p.title,
                    title: p.title || p.headingTitle || '',
                    topline: p.eventType || p.pageType || '',
                    firstSentence: String(p.description || '').slice(0, 400),
                    date: Number.isFinite(date) ? date : Date.now(),
                    url: p.link ? `https://www.nato.int${p.link.replace(/\?selectedLocale=$/, '')}` : null,
                    breaking: false,
                });
            }
        } catch { /* andere Liste versuchen */ }
    }
    if (ok === 0) throw new Error('nato.int nicht erreichbar');
    return items;
}

