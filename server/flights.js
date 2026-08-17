/**
 * Flugradar-Datenquelle.
 *
 * Flightradar24 selbst hat keine frei nutzbare API (nur kostenpflichtige
 * Business-Pläne), deshalb kommen die Live-Positionen aus einem der freien
 * ADS-B-Community-Feeds. Beide unterstützten Quellen liefern das gleiche
 * readsb/tar1090-Format, brauchen keinen API-Key und sind für private Nutzung
 * kostenlos. Für Detailinfos verlinkt das Frontend weiterhin auf
 * flightradar24.com.
 *
 * Der Server pollt die Quelle zentral und cached das Ergebnis: egal wie viele
 * Tablets/PWAs das Widget offen haben, es geht maximal ein Request pro
 * MIN_UPSTREAM_INTERVAL_MS nach draußen (die Feeds bitten um max. 1 Req/s).
 */

const SOURCES = {
    'adsb.lol': {
        label: 'adsb.lol',
        url: (lat, lon, radiusNm) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${radiusNm}`,
    },
    'airplanes.live': {
        label: 'airplanes.live',
        url: (lat, lon, radiusNm) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${radiusNm}`,
    },
};

const DEFAULT_SOURCE = 'adsb.lol';
const CACHE_TTL_MS = 15 * 1000;
const MIN_UPSTREAM_INTERVAL_MS = 5 * 1000;
const REQUEST_TIMEOUT_MS = 8000;
const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_RADIUS_KM = 400;
const KM_PER_NM = 1.852;

// key -> { at, data, error }
const cache = new Map();
// key -> Promise (in-flight upstream request, shared by concurrent callers)
const inflight = new Map();
// location name -> { at, coords }
const geocodeCache = new Map();

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

/** Great-circle distance in km. */
function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing from point 1 to point 2 in degrees (0 = north). */
function bearingDeg(lat1, lon1, lat2, lon2) {
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Map one raw aircraft record to our own shape. The feeds occasionally rename
 * or omit fields, so every value is read defensively and distance/bearing are
 * computed here instead of trusting the feed's own dst/dir.
 */
function normalizeAircraft(raw, homeLat, homeLon) {
    const lat = num(raw.lat) ?? num(raw.latitude);
    const lon = num(raw.lon) ?? num(raw.longitude);
    if (lat === null || lon === null) return null;

    // alt_baro is either a number (feet) or the string "ground".
    const rawAlt = raw.alt_baro ?? raw.altitude ?? raw.alt_geom;
    const onGround = rawAlt === 'ground' || raw.ground === true;
    const altitudeFt = onGround ? 0 : num(rawAlt);

    const groundSpeedKt = num(raw.gs) ?? num(raw.speed);
    const verticalRateFpm = num(raw.baro_rate) ?? num(raw.geom_rate) ?? num(raw.vert_rate);

    const callsign = String(raw.flight || raw.callsign || '').trim() || null;

    return {
        id: String(raw.hex || raw.icao || raw.icao24 || callsign || `${lat},${lon}`).trim(),
        hex: raw.hex ? String(raw.hex).trim() : null,
        callsign,
        registration: raw.r ? String(raw.r).trim() : null,
        aircraftType: raw.t ? String(raw.t).trim() : null,
        description: raw.desc ? String(raw.desc).trim() : null,
        lat,
        lon,
        altitudeFt,
        altitudeM: altitudeFt === null ? null : Math.round(altitudeFt * 0.3048),
        onGround,
        speedKmh: groundSpeedKt === null ? null : Math.round(groundSpeedKt * KM_PER_NM),
        track: num(raw.track) ?? num(raw.true_heading) ?? num(raw.mag_heading),
        verticalRateFpm,
        // "climbing"/"descending" only above a bit of noise (±150 ft/min)
        trend: verticalRateFpm === null || Math.abs(verticalRateFpm) < 150
            ? 'level'
            : verticalRateFpm > 0 ? 'climb' : 'descent',
        squawk: raw.squawk ? String(raw.squawk) : null,
        emergency: raw.emergency && raw.emergency !== 'none' ? String(raw.emergency) : null,
        distanceKm: Math.round(distanceKm(homeLat, homeLon, lat, lon) * 10) / 10,
        bearing: Math.round(bearingDeg(homeLat, homeLon, lat, lon)),
        seenSec: num(raw.seen_pos) ?? num(raw.seen),
    };
}

async function fetchUpstream(sourceKey, lat, lon, radiusKm) {
    const source = SOURCES[sourceKey] || SOURCES[DEFAULT_SOURCE];
    // The feeds take nautical miles and cap out at 250 nm.
    const radiusNm = Math.min(250, Math.max(1, Math.round(radiusKm / KM_PER_NM)));
    const url = source.url(lat.toFixed(4), lon.toFixed(4), radiusNm);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                // The community feeds ask for an identifiable client.
                'User-Agent': 'HomeDashboard/1.0 (+https://github.com/nobbie2009/homedashboard)',
            },
        });

        if (!res.ok) {
            throw new Error(`${source.label} antwortete mit HTTP ${res.status}`);
        }

        const data = await res.json();
        const list = Array.isArray(data.ac) ? data.ac
            : Array.isArray(data.aircraft) ? data.aircraft
            : Array.isArray(data) ? data
            : [];

        return list
            .map(item => normalizeAircraft(item, lat, lon))
            .filter(Boolean)
            .filter(f => f.distanceKm <= radiusKm)
            .sort((a, b) => a.distanceKm - b.distanceKm);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Cached flight lookup around a point.
 * @returns {Promise<{flights: Array, source: string, updatedAt: number, stale: boolean, error?: string}>}
 */
export async function getFlights({ lat, lon, radiusKm, source } = {}) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        throw new Error('Ungültige Koordinaten');
    }

    const sourceKey = SOURCES[source] ? source : DEFAULT_SOURCE;
    const radius = Math.min(MAX_RADIUS_KM, Math.max(5, Number(radiusKm) || 60));
    const key = `${sourceKey}|${lat.toFixed(3)}|${lon.toFixed(3)}|${radius}`;
    const now = Date.now();
    const cached = cache.get(key);

    if (cached && now - cached.at < CACHE_TTL_MS) {
        return { ...cached.data, stale: false };
    }

    // Never hammer the upstream feed, even if the cache just expired and a
    // dozen dashboards ask at once.
    if (cached && now - cached.at < MIN_UPSTREAM_INTERVAL_MS) {
        return { ...cached.data, stale: true };
    }

    if (inflight.has(key)) return inflight.get(key);

    const promise = (async () => {
        try {
            const flights = await fetchUpstream(sourceKey, lat, lon, radius);
            const data = {
                flights,
                source: SOURCES[sourceKey].label,
                center: { lat, lon },
                radiusKm: radius,
                updatedAt: Date.now(),
            };
            cache.set(key, { at: Date.now(), data });
            return { ...data, stale: false };
        } catch (e) {
            console.error('[Flights] Abruf fehlgeschlagen:', e.message);
            // Serve the last good answer rather than an empty sky.
            if (cached) {
                return { ...cached.data, stale: true, error: e.message };
            }
            throw e;
        } finally {
            inflight.delete(key);
        }
    })();

    inflight.set(key, promise);
    return promise;
}

/**
 * Resolve a place name to coordinates (Open-Meteo geocoder, same service the
 * rain radar uses). Cached for a day — the house does not move.
 */
export async function geocode(name) {
    const query = String(name || '').trim();
    if (!query) return null;

    const cached = geocodeCache.get(query.toLowerCase());
    if (cached && Date.now() - cached.at < GEOCODE_TTL_MS) return cached.coords;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=de&format=json`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const hit = data.results?.[0];
        if (!hit) return null;

        const coords = { lat: hit.latitude, lon: hit.longitude, name: hit.name };
        geocodeCache.set(query.toLowerCase(), { at: Date.now(), coords });
        return coords;
    } catch (e) {
        console.error('[Flights] Geocoding fehlgeschlagen:', e.message);
        return cached ? cached.coords : null;
    } finally {
        clearTimeout(timer);
    }
}

export const availableSources = Object.entries(SOURCES).map(([key, s]) => ({ key, label: s.label }));
