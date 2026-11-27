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
    /** Modus des Guardian, z. B. „Nacht“ */
    mode?: string | null;
    modeEntityId?: string | null;
    labels?: Record<string, string>;
    since?: number | null;
    error?: string | null;
    updatedAt: number | null;
}

/**
 * Stufen des Jarvis-Guardian (Echtzeit-Personenerkennung rund ums Haus per
 * Kamera + KI). Texte nach dem Guardian-Dashboard in Home Assistant.
 */
export const GUARDIAN_STYLES: Record<number, { hex: string; label: string; when: string; action: string }> = {
    0: {
        hex: '#10b981', label: 'Normal',
        when: 'Niemand in einer Schutzzone, Tiere, Autos auf der Straße, Passanten',
        action: 'Nur Aufzeichnung (Synology + Frigate). Keine Meldung.',
    },
    1: {
        hex: '#0ea5e9', label: 'Früherkennung',
        when: 'Person auf dem Grundstück (Rasen, Gehweg, Vorgarten). Tagsüber nur, wenn sie an einem Auto ist.',
        action: 'Mitteilung mit Bild aufs Handy. Tagsüber still, nachts mit Ton.',
    },
    2: {
        hex: '#fbbf24', label: 'Person am Auto',
        when: 'Nachts, abwesend oder im Urlaub: Person am Tesla-Stellplatz oder in der Auffahrt beim Kombi',
        action: 'Dringende Mitteilung, Flutlicht der Kamera 3 Min an (wenn dunkel), Jarvis-Durchsage wenn jemand zu Hause ist.',
    },
    3: {
        hex: '#f97316', label: 'Verweilt',
        when: 'Person bleibt länger als 10 Sekunden direkt am Auto',
        action: 'Neue dringende Mitteilung „verweilt am Fahrzeug“, Flutlicht, Knöpfe für Licht und Sirene.',
    },
    4: {
        hex: '#dc2626', label: 'Dringend',
        when: 'Bleibt nach Stufe 3 noch 30 s am Auto, 3 Meldungen in 5 Minuten oder Modus „Manueller Alarm“',
        action: 'Kritische Mitteilung (durchbricht Lautlos), alle Flutlichter an, Durchsage. Sirene nur per Knopf.',
    },
    5: {
        hex: '#a21caf', label: 'ALARMFALL',
        when: 'Nur von Hand: NS-Panel, Dashboard oder Knopf „ALARMFALL auslösen“ in einer Meldung',
        action: 'Alle Kamera-Flutlichter, Scheinwerfer vorn und Hauslichter an – bleibt an, bis er beendet wird.',
    },
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
