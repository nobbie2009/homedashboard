import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiUrl } from '../utils/api';
import { useSecurity } from '../contexts/SecurityContext';

export interface CatCareFeedingTime {
    time: string;
    completed: boolean;
    inReach: boolean;
    due: boolean;
    scheduledAt: number;
}

export interface CatCareStatus {
    enabled: boolean;
    config: {
        enabled: boolean;
        feedingTimes: string[];
        gracePreMinutes: number;
        litterEnabled: boolean;
        litterIntervalDays: number;
        litterTime: string;
    };
    feeding: {
        times: CatCareFeedingTime[];
        completedToday: string[];
        due: boolean;
        allCompleted: boolean;
        nextOpenInReach: string | null;
        nextScheduledOpen: string | null;
    };
    litter: {
        enabled: boolean;
        due: boolean;
        lastCleaned: number | null;
        nextDueAt: number | null;
    };
    now: number;
}

const POLL_INTERVAL_MS = 60 * 1000; // Recompute (via backend) once per minute

export function useCatCare() {
    const { deviceId } = useSecurity();
    const [status, setStatus] = useState<CatCareStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const inflight = useRef(false);

    const fetchStatus = useCallback(async () => {
        if (!deviceId || inflight.current) return;
        inflight.current = true;
        try {
            const res = await fetch(`${getApiUrl()}/api/catcare/status`, {
                headers: { 'x-device-id': deviceId }
            });
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
            }
        } catch (e) {
            console.error('catcare status fetch failed', e);
        } finally {
            inflight.current = false;
            setLoading(false);
        }
    }, [deviceId]);

    useEffect(() => {
        fetchStatus();
        const t = setInterval(fetchStatus, POLL_INTERVAL_MS);
        return () => clearInterval(t);
    }, [fetchStatus]);

    // SSE: listen for cat care events to update instantly
    useEffect(() => {
        const url = `${getApiUrl()}/api/stream/events`;
        const src = new EventSource(url);
        src.addEventListener('catcare', (e: MessageEvent) => {
            try {
                const data = JSON.parse(e.data);
                setStatus(data);
            } catch {}
        });
        src.onerror = () => src.close();
        return () => src.close();
    }, []);

    const feed = useCallback(async () => {
        if (!deviceId) return;
        try {
            const res = await fetch(`${getApiUrl()}/api/catcare/feed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({})
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status) setStatus(data.status);
                return data;
            }
        } catch (e) {
            console.error('catcare feed failed', e);
        }
    }, [deviceId]);

    const undoFeed = useCallback(async () => {
        if (!deviceId) return;
        try {
            const res = await fetch(`${getApiUrl()}/api/catcare/feed/undo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({})
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status) setStatus(data.status);
                return data;
            }
        } catch (e) {
            console.error('catcare undo feed failed', e);
        }
    }, [deviceId]);

    const cleanLitter = useCallback(async () => {
        if (!deviceId) return;
        try {
            const res = await fetch(`${getApiUrl()}/api/catcare/litter`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({})
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status) setStatus(data.status);
                return data;
            }
        } catch (e) {
            console.error('catcare clean failed', e);
        }
    }, [deviceId]);

    return { status, loading, refresh: fetchStatus, feed, undoFeed, cleanLitter };
}
