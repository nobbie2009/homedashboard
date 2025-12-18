import React, { useState, useEffect, useMemo } from 'react';
import { differenceInSeconds } from 'date-fns';
import { useGoogleEvents } from '../../hooks/useGoogleEvents';

export const CountdownWidget: React.FC = () => {
    const [now, setNow] = useState(new Date());
    const { events, loading } = useGoogleEvents();

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const nextEvent = useMemo(() => {
        if (!events || events.length === 0) return null;
        // Events are already sorted by start time in the hook
        return events.find(e => e.start > now);
    }, [events, now]);

    if (loading && !nextEvent) {
        return (
            <div className="flex flex-col items-center justify-center p-4 bg-slate-800/50 rounded-xl border border-slate-700 h-full text-slate-500 animate-pulse">
                <span className="text-lg">Lade Termine...</span>
            </div>
        );
    }

    if (!nextEvent) {
        return (
            <div className="flex flex-col items-center justify-center p-4 bg-slate-800/50 rounded-xl border border-slate-700 h-full text-slate-500">
                <span className="text-lg">Keine weiteren Termine</span>
            </div>
        );
    }

    const diffSeconds = differenceInSeconds(nextEvent.start, now);
    const hours = Math.floor(diffSeconds / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);
    const seconds = diffSeconds % 60;

    // Safety check for negative countdowns (should happen rarely due to find logic)
    if (diffSeconds < 0) return null;

    return (
        <div className="flex flex-col p-4 bg-slate-800/50 rounded-xl border border-slate-700 h-full items-center justify-center relative overflow-hidden group">
            {/* Background progress or glow could go here */}

            <h3 className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-widest">Nächstes Event</h3>

            <div className="flex items-baseline space-x-2">
                <div className="flex flex-col items-center">
                    <span className="text-5xl font-black text-white tabular-nums leading-none">{String(hours).padStart(2, '0')}</span>
                    <span className="text-xs text-slate-500 uppercase mt-1">Std</span>
                </div>
                <span className="text-3xl text-slate-600 font-light -mt-4">:</span>
                <div className="flex flex-col items-center">
                    <span className="text-5xl font-black text-white tabular-nums leading-none">{String(minutes).padStart(2, '0')}</span>
                    <span className="text-xs text-slate-500 uppercase mt-1">Min</span>
                </div>
                <span className="text-3xl text-slate-600 font-light -mt-4">:</span>
                <div className="flex flex-col items-center">
                    <span className="text-5xl font-black text-blue-400 tabular-nums leading-none">{String(seconds).padStart(2, '0')}</span>
                    <span className="text-xs text-slate-500 uppercase mt-1">Sek</span>
                </div>
            </div>

            <div className="mt-4 text-center max-w-full px-4">
                <div className="text-xl font-bold text-white truncate leading-tight" style={{ color: nextEvent.color || 'white' }}>
                    {nextEvent.title}
                </div>
                {nextEvent.location && (
                    <div className="text-xs text-slate-400 mt-1 truncate max-w-[200px] mx-auto">
                        📍 {nextEvent.location}
                    </div>
                )}
            </div>
        </div>
    );
};
