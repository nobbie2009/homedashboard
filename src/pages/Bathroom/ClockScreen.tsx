import React, { useEffect, useState } from 'react';
import type { BathroomStateResponse } from './types';

interface Props {
    nextWindow: BathroomStateResponse['nextWindow'];
    error: string | null;
}

function formatClock(d: Date) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const ClockScreen: React.FC<Props> = ({ nextWindow, error }) => {
    const [clock, setClock] = useState(() => formatClock(new Date()));
    useEffect(() => {
        const id = setInterval(() => setClock(formatClock(new Date())), 10_000);
        return () => clearInterval(id);
    }, []);

    const caption = nextWindow
        ? `Nächste Routine: ${nextWindow.name === 'morning' ? 'Morgen-Routine' : 'Abend-Routine'} um ${nextWindow.startsAt}`
        : 'Keine Routine geplant';

    return (
        <div className="h-screen w-screen bg-slate-950 text-white flex flex-col items-center justify-center">
            <div className="text-[96px] leading-none font-bold tabular-nums">{clock}</div>
            <div className="mt-6 text-lg text-slate-400">{caption}</div>
            {error && <div className="mt-3 text-sm text-red-400">{error}</div>}
        </div>
    );
};
