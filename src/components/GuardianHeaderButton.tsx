import React from 'react';
import { createPortal } from 'react-dom';
import { Shield, X, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { useGuardian, GUARDIAN_STYLES } from '../hooks/useGuardian';

const fmtSince = (ts?: number | null) => {
    if (!ts) return null;
    const d = new Date(ts);
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/**
 * Header-Button „GUARDIAN x“ neben „LAGE x“: Eskalationsstufe des
 * Jarvis-Guardian aus Home Assistant. Klick öffnet die Stufenübersicht.
 */
export const GuardianHeaderButton: React.FC = () => {
    const { snapshot, refresh } = useGuardian();
    const [open, setOpen] = React.useState(false);
    const [busy, setBusy] = React.useState(false);

    React.useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    if (snapshot && snapshot.enabled === false) return null;

    const level = snapshot?.level ?? null;
    const st = level !== null ? GUARDIAN_STYLES[level] : null;
    const labelFor = (l: number) =>
        snapshot?.labels?.[String(l)] || (l === level && snapshot?.description) || GUARDIAN_STYLES[l].label;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className={clsx(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors active:scale-95",
                    "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700",
                    level !== null && level >= 4 && "animate-pulse"
                )}
                title={snapshot?.description ? `Jarvis-Guardian: ${snapshot.description}` : 'Jarvis-Guardian'}
            >
                {st ? (
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: st.hex }} />
                ) : (
                    <Shield className="w-4 h-4" />
                )}
                <span className="whitespace-nowrap">{level !== null ? `GUARDIAN ${level}` : 'Guardian'}</span>
            </button>

            {open && createPortal(
                <div
                    className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
                    onClick={() => setOpen(false)}
                >
                    <div
                        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6 text-slate-800 dark:text-slate-100"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 mb-5">
                            <div className="flex items-center gap-3">
                                <Shield className="w-7 h-7" style={{ color: st?.hex }} />
                                <div>
                                    <div className="text-xl font-bold">Jarvis-Guardian</div>
                                    <div className="text-xs text-slate-500">Eskalationsstufe aus Home Assistant</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                                    title="Neu laden"
                                    onClick={async () => { setBusy(true); try { await refresh(); } finally { setBusy(false); } }}
                                >
                                    <RefreshCw className={clsx("w-5 h-5", busy && "animate-spin")} />
                                </button>
                                <button className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" title="Schließen" onClick={() => setOpen(false)}>
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {st ? (
                            <div className="flex items-center gap-4 rounded-xl p-4 mb-5" style={{ backgroundColor: `${st.hex}1f` }}>
                                <div className="text-5xl font-black tabular-nums" style={{ color: st.hex }}>{level}</div>
                                <div className="min-w-0">
                                    <div className="text-lg font-semibold">{snapshot?.description || st.label}</div>
                                    {snapshot?.since && <div className="text-xs text-slate-500">seit {fmtSince(snapshot.since)}</div>}
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl p-4 mb-5 bg-slate-100 dark:bg-slate-800 text-sm">
                                {snapshot?.error || 'Stufe wird geladen …'}
                            </div>
                        )}

                        <div className="space-y-1.5">
                            {[0, 1, 2, 3, 4, 5].map(l => (
                                <div
                                    key={l}
                                    className={clsx(
                                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm",
                                        l === level ? "font-semibold" : "opacity-60"
                                    )}
                                    style={l === level ? { boxShadow: `0 0 0 2px ${GUARDIAN_STYLES[l].hex}` } : undefined}
                                >
                                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                                        style={{ backgroundColor: GUARDIAN_STYLES[l].hex }}>{l}</span>
                                    <span className="truncate">{labelFor(l)}</span>
                                </div>
                            ))}
                        </div>

                        {snapshot?.entityId && (
                            <div className="mt-4 text-[11px] text-slate-400 font-mono">
                                {snapshot.entityId}{snapshot.autoDetected ? ' (automatisch gefunden)' : ''}
                                {snapshot.error && level !== null ? ` · ${snapshot.error}` : ''}
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default GuardianHeaderButton;
