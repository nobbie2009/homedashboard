import React, { useState, useEffect, useMemo } from 'react';
import { differenceInSeconds } from 'date-fns';
import { mockEvents } from '../../services/mockData';

export const CountdownWidget: React.FC = () => {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const nextEvent = useMemo(() => {
        return mockEvents
            .sort((a, b) => a.start.getTime() - b.start.getTime())
            .find(e => e.start > now);
    }, [now]);

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

    return (
        <div className="flex flex-col p-4 bg-slate-800/50 rounded-xl border border-slate-700 h-full items-center justify-center">
            <h3 className="text-lg font-semibold text-slate-300 mb-1 uppercase tracking-wider">Nächstes Event</h3>
            <div className="text-4xl font-bold text-white mt-2 font-mono tabular-nums">
                {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </div>
            <div className="text-slate-400 mt-2 text-center max-w-full truncate px-2">
                bis {nextEvent.title}
            </div>
        </div>
    );
};
