import React from 'react';
import { format } from 'date-fns';
import { ShieldAlert, X } from 'lucide-react';
import { getApiUrl, fetchWithTimeout } from '../../utils/api';
import { useSecurity } from '../../contexts/SecurityContext';
import { LEVEL_STYLES, LageAlarmPayload, LageSnapshot } from '../../hooks/useLage';

const ACK_KEY = 'lage-alarm-ack';

const readAck = (): string | null => {
    try { return localStorage.getItem(ACK_KEY); } catch { return null; }
};
const writeAck = (id: string) => {
    try { localStorage.setItem(ACK_KEY, id); } catch { /* egal */ }
};

/**
 * Wegklickbares Vollbild-Popup bei LAGE-Alarm. Kommt per SSE („lage-alarm“);
 * ein Dashboard, das beim Alarm aus war, zeigt einen noch anhaltenden,
 * nicht quittierten Alarm beim Start nach.
 */
export const LageAlarmOverlay: React.FC<{ onShow?: () => void }> = ({ onShow }) => {
    const { deviceId } = useSecurity();
    const [alarm, setAlarm] = React.useState<LageAlarmPayload | null>(null);

    // onShow kommt als Inline-Funktion – per Ref, damit SSE nicht bei jedem Render neu verbindet.
    const onShowRef = React.useRef(onShow);
    onShowRef.current = onShow;
    const show = React.useCallback((a: LageAlarmPayload) => {
        setAlarm(a);
        onShowRef.current?.();
    }, []);

    // Beim Start: anhaltenden, noch nicht quittierten Alarm nachholen
    React.useEffect(() => {
        if (!deviceId) return;
        fetchWithTimeout(`${getApiUrl()}/api/lage`, { headers: { 'x-device-id': deviceId } })
            .then(r => (r.ok ? r.json() : null))
            .then((s: (LageSnapshot & { lastAlarm?: { id: string; resolvedAt: number | null; payload?: LageAlarmPayload } }) | null) => {
                const la = s?.lastAlarm;
                if (la && !la.resolvedAt && la.payload && readAck() !== la.id) show(la.payload);
            })
            .catch(() => { /* ignorieren */ });
    }, [deviceId, show]);

    React.useEffect(() => {
        if (!deviceId) return;
        const src = new EventSource(`${getApiUrl()}/api/stream/events/${encodeURIComponent(deviceId)}`);
        src.addEventListener('lage-alarm', (e: MessageEvent) => {
            try { show(JSON.parse(e.data)); } catch { /* ignorieren */ }
        });
        return () => src.close();
    }, [deviceId, show]);

    if (!alarm) return null;

    const st = LEVEL_STYLES[alarm.level] || LEVEL_STYLES[2];
    const close = () => {
        if (!alarm.test) writeAck(alarm.id);
        setAlarm(null);
    };

    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/80 backdrop-blur-sm p-6" onClick={close}>
            <div
                className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border-4"
                style={{ borderColor: st.hex }}
                onClick={e => e.stopPropagation()}
            >
                <div className={`${st.bg} text-white px-6 py-5 flex items-center gap-4`}>
                    <ShieldAlert className="w-12 h-12 animate-pulse flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        {alarm.test && <div className="text-xs font-bold tracking-widest bg-white/25 inline-block rounded px-2 mb-1">TEST</div>}
                        <div className="text-3xl font-black">LAGE {alarm.level} – {alarm.label}</div>
                        <div className="text-sm opacity-90">{format(alarm.ts, 'dd.MM.yyyy HH:mm')} Uhr</div>
                    </div>
                    <button onClick={close} className="p-2 rounded-full bg-white/15 hover:bg-white/30" aria-label="Schließen">
                        <X className="w-8 h-8" />
                    </button>
                </div>
                <div className="px-6 py-5 space-y-3 text-slate-700 dark:text-slate-200">
                    {alarm.decisive && (
                        <div className="text-lg font-semibold">{alarm.decisive.source}: {alarm.decisive.reason}</div>
                    )}
                    {alarm.reasons?.length > 0 && (
                        <ul className="list-disc pl-5 space-y-1">
                            {alarm.reasons.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                    )}
                    <div className="text-sm text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-3">
                        Eigene Einschätzung des Dashboards – keine amtliche Warnung. Maßgeblich sind NINA,
                        Sirenen, Cell Broadcast, Radio und die Anweisungen der Behörden. Details in der Kachel „Lage-Index“.
                    </div>
                    <button
                        onClick={close}
                        className="w-full mt-2 py-4 rounded-xl text-white text-xl font-bold"
                        style={{ backgroundColor: st.hex }}
                    >
                        Verstanden
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LageAlarmOverlay;
