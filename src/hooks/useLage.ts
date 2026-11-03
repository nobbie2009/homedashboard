import { useCallback, useEffect, useState } from 'react';
import { getApiUrl, fetchWithTimeout } from '../utils/api';
import { useSecurity } from '../contexts/SecurityContext';

export type LageColor = 'green' | 'blue' | 'yellow' | 'orange' | 'red';

export interface LageEvent {
    title: string;
    url?: string | null;
    ts: number;
    decayed: number;
    breaking?: boolean;
    ruleId?: string;
}

export interface LageIndicator {
    id: string;
    label: string;
    group: 'luft' | 'politik' | 'oeffentlichkeit';
    points: number;
    detail: string;
    events: LageEvent[];
    value?: number;
    mean?: number;
    std?: number;
    z?: number;
    samples?: number;
    learning?: boolean;
    byType?: Record<string, number>;
    list?: { cs: string | null; reg: string | null; type: string | null }[];
    articles?: { article: string; views: number; mean: number; z: number }[];
}

export interface LageGroup {
    id: string;
    label: string;
    weight: number;
    raw: number;
    points: number;
    active: boolean;
    indicators: string[];
}

export interface LageFloor {
    level: number;
    source: string;
    reason: string;
}

export interface LageSnapshot {
    enabled: boolean;
    loading?: boolean;
    updatedAt: number | null;
    level?: number;
    label?: string;
    color?: LageColor;
    since?: number;
    computedLevel?: number;
    indicatorLevel?: number;
    decisive?: LageFloor | null;
    floors?: LageFloor[];
    total?: number;
    activeGroups?: string[];
    reasons?: string[];
    groups?: Record<string, LageGroup>;
    indicators?: Record<string, LageIndicator>;
    official?: {
        ars: string | null;
        ninaLocal: { id: string; headline: string; title: string; severity: string; provider: string; level: number | null }[];
        ninaLocalWeatherCount: number;
        ninaNational: { id: string; title: string; severity: string; level: number }[];
        radiation: {
            level: number | null;
            max: { name: string; value: number; distanceKm: number } | null;
            stations: { name: string; value: number; distanceKm: number }[];
            nationwideOverAlarm: { name: string; value: number }[];
            count: number;
        } | null;
        manual: { level: number; note: string } | null;
    };
    kontext?: { label: string; from: string; to: string }[];
    sources?: Record<string, { ok?: boolean; at: number | null; error: string | null }>;
    lastAlarm?: { id: string; level: number; ts: number; resolvedAt: number | null } | null;
    alarm?: { enabled: boolean; minLevel: number; haEnabled: boolean };
    calc?: { weights: Record<string, number>; thresholds: Record<string, number> };
}

export interface LageAlarmPayload {
    id: string;
    test: boolean;
    level: number;
    label: string;
    color: LageColor;
    titel: string;
    text: string;
    reasons: string[];
    decisive: LageFloor | null;
    ts: number;
}

export const LEVEL_STYLES: Record<number, { bg: string; text: string; ring: string; soft: string; hex: string }> = {
    5: { bg: 'bg-emerald-500', text: 'text-emerald-500', ring: 'ring-emerald-500/40', soft: 'bg-emerald-500/10', hex: '#10b981' },
    4: { bg: 'bg-sky-500', text: 'text-sky-500', ring: 'ring-sky-500/40', soft: 'bg-sky-500/10', hex: '#0ea5e9' },
    3: { bg: 'bg-amber-400', text: 'text-amber-500', ring: 'ring-amber-400/50', soft: 'bg-amber-400/10', hex: '#fbbf24' },
    2: { bg: 'bg-orange-500', text: 'text-orange-500', ring: 'ring-orange-500/50', soft: 'bg-orange-500/10', hex: '#f97316' },
    1: { bg: 'bg-red-600', text: 'text-red-500', ring: 'ring-red-600/60', soft: 'bg-red-600/10', hex: '#dc2626' },
};

const POLL_MS = 60_000;

/** Aktueller LAGE-Stand: lädt beim Start, hört auf SSE „lage“, pollt als Rückfall. */
export function useLage() {
    const { deviceId } = useSecurity();
    const [snapshot, setSnapshot] = useState<LageSnapshot | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!deviceId) return;
        try {
            const res = await fetchWithTimeout(`${getApiUrl()}/api/lage`, { headers: { 'x-device-id': deviceId } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setSnapshot(await res.json());
            setError(null);
        } catch (e) {
            setError((e as Error).message);
        }
    }, [deviceId]);

    useEffect(() => {
        load();
        const t = setInterval(load, POLL_MS);
        return () => clearInterval(t);
    }, [load]);

    useEffect(() => {
        if (!deviceId) return;
        const src = new EventSource(`${getApiUrl()}/api/stream/events/${encodeURIComponent(deviceId)}`);
        src.addEventListener('lage', (e: MessageEvent) => {
            try { setSnapshot(JSON.parse(e.data)); } catch { /* ignorieren */ }
        });
        return () => src.close();
    }, [deviceId]);

    const refresh = useCallback(async () => {
        if (!deviceId) return;
        const res = await fetchWithTimeout(`${getApiUrl()}/api/lage/refresh`, {
            method: 'POST', headers: { 'x-device-id': deviceId },
        }, 180_000);
        if (res.ok) setSnapshot(await res.json());
    }, [deviceId]);

    return { snapshot, error, refresh };
}
