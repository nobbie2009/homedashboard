import React, { useEffect, useState } from 'react';
import { Printer, Loader2, Check, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { useSecurity } from '../contexts/SecurityContext';
import { getApiUrl, fetchWithTimeout } from '../utils/api';

type State = 'idle' | 'busy' | 'ok' | 'error';

interface PrintButtonProps {
    label: string;
    /** Backend-Endpunkt, z. B. `/api/printer/einkaufszettel` */
    endpoint: string;
    body?: () => Record<string, unknown>;
    /** Erfolgsmeldung aus der Serverantwort */
    successText: (data: any) => string;
    icon?: React.ElementType;
}

// Der Pi druckt nur einen Auftrag gleichzeitig (ca. 4 s pro Zettel), bei einer
// Warteschlange oder einem Bluetooth-Neuverbinden kann es länger dauern.
const PRINT_TIMEOUT_MS = 45000;
const FEEDBACK_MS = 5000;

/** Header-Button, der über das Backend auf dem Küchendrucker druckt. */
export const PrintButton: React.FC<PrintButtonProps> = ({ label, endpoint, body, successText, icon: Icon = Printer }) => {
    const { deviceId } = useSecurity();
    const [state, setState] = useState<State>('idle');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (state !== 'ok' && state !== 'error') return;
        const t = setTimeout(() => setState('idle'), state === 'error' ? FEEDBACK_MS * 2 : FEEDBACK_MS);
        return () => clearTimeout(t);
    }, [state]);

    const print = async () => {
        if (state === 'busy') return;
        setState('busy');
        setMessage('Druckt…');
        try {
            const res = await fetchWithTimeout(`${getApiUrl()}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify(body ? body() : {})
            }, PRINT_TIMEOUT_MS);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
            setMessage(successText(data));
            setState('ok');
        } catch (e) {
            const err = e as Error;
            setMessage(err.name === 'AbortError' ? 'Drucker antwortet nicht' : err.message);
            setState('error');
        }
    };

    const StateIcon = state === 'busy' ? Loader2 : state === 'ok' ? Check : state === 'error' ? AlertTriangle : Icon;

    return (
        <div className="relative">
            <button
                onClick={print}
                disabled={state === 'busy'}
                className={clsx(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors active:scale-95",
                    state === 'ok' && "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-800 text-green-700 dark:text-green-300",
                    state === 'error' && "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300",
                    (state === 'idle' || state === 'busy') && "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                )}
                title={label}
            >
                <StateIcon className={clsx("w-4 h-4", state === 'busy' && "animate-spin")} />
                <span className="whitespace-nowrap">{label}</span>
            </button>
            {state !== 'idle' && (
                <div
                    role="status"
                    className={clsx(
                        "absolute right-0 top-full mt-2 z-50 w-max max-w-xs rounded-lg px-3 py-2 text-sm shadow-lg border",
                        state === 'error'
                            ? "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-200"
                            : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                    )}
                >
                    {message}
                </div>
            )}
        </div>
    );
};
