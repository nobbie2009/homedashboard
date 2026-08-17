import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiUrl } from '../utils/api';
import { useSecurity } from '../contexts/SecurityContext';
import { useConfig } from '../contexts/ConfigContext';

export interface Flight {
    id: string;
    hex: string | null;
    callsign: string | null;
    registration: string | null;
    aircraftType: string | null;
    description: string | null;
    lat: number;
    lon: number;
    altitudeFt: number | null;
    altitudeM: number | null;
    onGround: boolean;
    speedKmh: number | null;
    track: number | null;
    verticalRateFpm: number | null;
    trend: 'climb' | 'descent' | 'level';
    squawk: string | null;
    emergency: string | null;
    distanceKm: number;
    bearing: number;
    seenSec: number | null;
}

export interface FlightsResult {
    flights: Flight[];
    center: { lat: number; lon: number };
    radiusKm: number;
    source: string;
    updatedAt: number;
    total: number;
    stale?: boolean;
    error?: string;
}

const MIN_REFRESH_SEC = 10;

/**
 * Polls the backend flight endpoint. The backend caches upstream calls, so a
 * short interval here only costs a local request. Polling pauses while the
 * document is hidden (screensaver, other tab) and resumes on wake-up.
 */
export function useFlights(limit = 50) {
    const { deviceId } = useSecurity();
    const { config } = useConfig();
    const [data, setData] = useState<FlightsResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const inflight = useRef(false);

    const refreshSec = Math.max(MIN_REFRESH_SEC, config.flights?.refreshSeconds ?? 20);

    const fetchFlights = useCallback(async () => {
        if (!deviceId || inflight.current) return;
        if (typeof document !== 'undefined' && document.hidden) return;

        inflight.current = true;
        try {
            const res = await fetch(`${getApiUrl()}/api/flights?limit=${limit}`, {
                headers: { 'x-device-id': deviceId }
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            setData(json);
            setError(null);
        } catch (e: any) {
            console.error('flights fetch failed', e);
            setError(e?.message || 'Flugdaten nicht verfügbar');
        } finally {
            inflight.current = false;
            setLoading(false);
        }
    }, [deviceId, limit]);

    useEffect(() => {
        fetchFlights();
        const timer = setInterval(fetchFlights, refreshSec * 1000);
        const onVisible = () => { if (!document.hidden) fetchFlights(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [fetchFlights, refreshSec]);

    return { data, flights: data?.flights ?? [], error, loading, refresh: fetchFlights };
}

/** Deep link into Flightradar24 for the details this feed cannot provide. */
export function fr24Link(flight: Flight): string {
    if (flight.callsign) return `https://www.flightradar24.com/${encodeURIComponent(flight.callsign)}`;
    if (flight.registration) return `https://www.flightradar24.com/data/aircraft/${encodeURIComponent(flight.registration)}`;
    return 'https://www.flightradar24.com/';
}

/** 350° -> "N", 47° -> "NO" … for the compass label. */
export function compassLabel(bearing: number): string {
    const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(bearing / 45) % 8];
}
