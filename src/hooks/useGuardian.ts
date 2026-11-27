import { useCallback, useEffect, useState } from 'react';
import { getApiUrl, fetchWithTimeout } from '../utils/api';
import { useSecurity } from '../contexts/SecurityContext';

export interface GuardianSnapshot {
    enabled: boolean;
    loading?: boolean;
    entityId?: string;
    autoDetected?: boolean;
    name?: string | null;
    /** 0 = Ruhe … 5 = höchste Eskalation; null = unbekannt */
    level: number | null;
    rawState?: string;
    description?: string | null;
    labels?: Record<string, string>;
    since?: number | null;
    error?: string | null;
    updatedAt: number | null;
}

/** Farben je Guardian-Stufe – 0 ruhig (grün) bis 5 höchste Eskalation (violett). */
export const GUARDIAN_STYLES: Record<number, { hex: string; label: string }> = {
    0: { hex: '#10b981', label: 'Ruhe' },
    1: { hex: '#0ea5e9', label: 'Beobachten' },
    2: { hex: '#fbbf24', label: 'Erhöht' },
    3: { hex: '#f97316', label: 'Hoch' },
    4: { hex: '#dc2626', label: 'Sehr hoch' },
    5: { hex: '#a21caf', label: 'Maximal' },
};

const POLL_MS = 60_000;

/** Aktuelle Guardian-Stufe: lädt beim Start, hört auf SSE „guardian“, pollt als Rückfall. */
export function useGuardian() {
    const { deviceId } = useSecurity();
    const [snapshot, setSnapshot] = useState<GuardianSnapshot | null>(null);

    const load = useCallback(async () => {
        if (!deviceId) return;
        try {
            const res = await fetchWithTimeout(`${getApiUrl()}/api/guardian`, { headers: { 'x-device-id': deviceId } });
            if (res.ok) setSnapshot(await res.json());
        } catch { /* nächster Versuch beim Poll */ }
    }, [deviceId]);

    useEffect(() => {
        load();
        const t = setInterval(load, POLL_MS);
        return () => clearInterval(t);
    }, [load]);

    useEffect(() => {
        if (!deviceId) return;
        const src = new EventSource(`${getApiUrl()}/api/stream/events/${encodeURIComponent(deviceId)}`);
        src.addEventListener('guardian', (e: MessageEvent) => {
            try { setSnapshot(JSON.parse(e.data)); } catch { /* ignorieren */ }
        });
        return () => src.close();
    }, [deviceId]);

    const refresh = useCallback(async () => {
        if (!deviceId) return;
        const res = await fetchWithTimeout(`${getApiUrl()}/api/guardian/refresh`, {
            method: 'POST', headers: { 'x-device-id': deviceId },
        });
        if (res.ok) setSnapshot(await res.json());
    }, [deviceId]);

    return { snapshot, refresh };
}
