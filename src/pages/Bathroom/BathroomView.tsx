import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSecurity } from '../../contexts/SecurityContext';
import { getApiUrl } from '../../utils/api';
import type { BathroomStateResponse } from './types';
import { ActiveWindowList } from './ActiveWindowList';
import { ClockScreen } from './ClockScreen';
import { SuccessScreen } from './SuccessScreen';

const POLL_MS = 30_000;

const BathroomView: React.FC = () => {
    const { deviceId } = useSecurity();
    const [state, setState] = useState<BathroomStateResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const API_URL = getApiUrl();
    const abortRef = useRef<AbortController | null>(null);

    const fetchState = useCallback(async () => {
        if (!deviceId) return;
        abortRef.current?.abort();
        const ctl = new AbortController();
        abortRef.current = ctl;
        try {
            const res = await fetch(`${API_URL}/api/bathroom/state`, {
                headers: { 'x-device-id': deviceId },
                signal: ctl.signal
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: BathroomStateResponse = await res.json();
            setState(data);
            setError(null);
        } catch (err) {
            if ((err as Error).name === 'AbortError') return;
            setError('Keine Verbindung');
        }
    }, [API_URL, deviceId]);

    useEffect(() => {
        fetchState();
        const id = setInterval(fetchState, POLL_MS);
        return () => { clearInterval(id); abortRef.current?.abort(); };
    }, [fetchState]);

    const toggle = useCallback(async (itemId: string, action: 'complete' | 'uncomplete') => {
        if (!deviceId) return null;
        const res = await fetch(`${API_URL}/api/bathroom/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
            body: JSON.stringify({ itemId, action })
        });
        if (res.status === 409) {
            fetchState();
            return null;
        }
        if (!res.ok) {
            setError('Fehler');
            return null;
        }
        const data: BathroomStateResponse = await res.json();
        setState(data);
        setError(null);
        return data;
    }, [API_URL, deviceId, fetchState]);

    if (!state) {
        return (
            <div className="h-screen w-screen bg-slate-900 text-slate-400 flex items-center justify-center">
                {error || 'Lädt...'}
            </div>
        );
    }

    if (state.currentWindow === 'none') {
        return <ClockScreen nextWindow={state.nextWindow} error={error} />;
    }

    const windowItems = state.items;
    const openItems = windowItems.filter(i => !state.completed[i.id]);
    if (windowItems.length > 0 && openItems.length === 0) {
        return <SuccessScreen window={state.currentWindow} items={windowItems} />;
    }

    return (
        <ActiveWindowList
            state={state}
            onToggle={toggle}
            error={error}
        />
    );
};

export default BathroomView;
