import React, { useState, useEffect, useMemo } from 'react';
import { differenceInSeconds, format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useGoogleEvents } from '../../hooks/useGoogleEvents';

export const CountdownWidget: React.FC = () => {
    const [now, setNow] = useState(new Date());
    const [showKatWarn, setShowKatWarn] = useState(false);
    const { events, loading } = useGoogleEvents({ scope: 'nextEvent' });

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const nextEvent = useMemo(() => {
        if (!events || events.length === 0) return null;
        // Events are already sorted by start time in the hook.
        // Ganztägige Termine haben keine Startzeit — ein Sekunden-Countdown
        // auf deren (künstliche) Mitternacht wäre irreführend.
        return events.find(e => !e.allDay && e.start > now);
    }, [events, now]);

    const katWarnView = (
        <div
            className="widget-card flex flex-col p-4 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl border border-slate-300 dark:border-slate-700 h-full items-center justify-center relative overflow-hidden cursor-pointer select-none"
            onClick={() => setShowKatWarn(false)}
        >
            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-widest">KatWarn</h3>
            <a href="https://warnungen.katwarn.de/" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                <img
                    alt="Katwarn Warnungen"
                    src="https://warnungen.katwarn.de/widget/ndh_plateau.png"
                    className="max-w-full max-h-full object-contain rounded-lg"
                />
            </a>
        </div>
    );

    if (showKatWarn) return katWarnView;

    if (loading && !nextEvent) {
        return (
            <div
                className="widget-card flex flex-col items-center justify-center p-4 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl border border-slate-300 dark:border-slate-700 h-full text-slate-400 dark:text-slate-500 animate-pulse cursor-pointer select-none"
                onClick={() => setShowKatWarn(true)}
            >
                <span className="text-lg">Lade Termine...</span>
            </div>
        );
    }

    if (!nextEvent) {
        return (
            <div
                className="widget-card flex flex-col items-center justify-center p-4 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl border border-slate-300 dark:border-slate-700 h-full text-slate-400 dark:text-slate-500 cursor-pointer select-none"
                onClick={() => setShowKatWarn(true)}
            >
                <span className="text-lg">Keine weiteren Termine</span>
            </div>
        );
    }

    const diffSeconds = differenceInSeconds(nextEvent.start, now);

    // Safety check for negative countdowns (should happen rarely due to find logic)
    if (diffSeconds < 0) return null;

    const days = Math.floor(diffSeconds / 86400);
    const hours = Math.floor((diffSeconds % 86400) / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    const seconds = diffSeconds % 60;

    // Immer genau drei Einheiten, damit die Kachel nie umbricht: ab einem Tag
    // Restzeit zählt Tag/Std/Min, darunter die gewohnte Uhrzeit-Zählung.
    const segments = days > 0
        ? [
            { value: days, label: days === 1 ? 'Tag' : 'Tage', accent: false },
            { value: hours, label: 'Std', accent: false },
            { value: minutes, label: 'Min', accent: true }
        ]
        : [
            { value: hours, label: 'Std', accent: false },
            { value: minutes, label: 'Min', accent: false },
            { value: seconds, label: 'Sek', accent: true }
        ];

    return (
        <div
            className="widget-card flex flex-col p-3 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl border border-slate-300 dark:border-slate-700 h-full items-center justify-center relative overflow-hidden group cursor-pointer select-none"
            onClick={() => setShowKatWarn(true)}
        >
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-widest">Nächstes Event</h3>

            <div className="flex items-start justify-center gap-1.5">
                {segments.map((seg, idx) => (
                    <React.Fragment key={seg.label}>
                        {idx > 0 && (
                            <span className="text-2xl text-slate-400 dark:text-slate-600 font-light leading-none">:</span>
                        )}
                        <div className="flex flex-col items-center">
                            <span className={`text-4xl font-black tabular-nums leading-none ${seg.accent ? 'text-blue-400' : 'text-slate-900 dark:text-white'}`}>
                                {String(seg.value).padStart(2, '0')}
                            </span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase mt-1 tracking-wide">{seg.label}</span>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            <div className="mt-3 text-center w-full px-1">
                <div className="text-base font-bold text-slate-900 dark:text-white truncate leading-tight" style={{ color: nextEvent.color || undefined }}>
                    {nextEvent.title}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {format(nextEvent.start, days > 0 ? 'EEEE, HH:mm' : "'um' HH:mm", { locale: de })}
                </div>
                {nextEvent.location && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        📍 {nextEvent.location}
                    </div>
                )}
            </div>
        </div>
    );
};
