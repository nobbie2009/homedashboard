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
    // Europa grob
    bbox: { minLat: 34, maxLat: 72, minLon: -25, maxLon: 45 },
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
    const c = { ...DEFAULT_AIR, ...cfg, bbox: { ...DEFAULT_AIR.bbox, ...(cfg.bbox || {}) } };
    const airborne = ac.filter(a => typeof a.lat === 'number' && typeof a.lon === 'number' && a.alt_baro !== 'ground');
    const inEurope = (a) => a.lat >= c.bbox.minLat && a.lat <= c.bbox.maxLat && a.lon >= c.bbox.minLon && a.lon <= c.bbox.maxLon;
    const short = (a) => ({ cs: trimCs(a.flight) || null, reg: a.r || null, type: a.t || null, lat: Math.round(a.lat * 100) / 100, lon: Math.round(a.lon * 100) / 100 });

    const vip = airborne.filter(a => {
        const cs = trimCs(a.flight).toUpperCase();
        const reg = String(a.r || '');
        return c.vipCallsignPrefixes.some(p => cs.startsWith(p) && /\d/.test(cs.slice(p.length)))
            || c.vipRegPrefixes.some(p => reg.startsWith(p));
    });
    const watched = airborne.filter(a => inEurope(a) && c.watchTypes.includes(a.t));
    const doomsday = airborne.filter(a => inEurope(a) && c.doomsdayTypes.includes(a.t));

    const byType = {};
    for (const a of watched) byType[a.t] = (byType[a.t] || 0) + 1;

    return {
        vipCount: vip.length,
        vip: vip.map(short),
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
