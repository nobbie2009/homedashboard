import React, { useState, useEffect, useMemo } from 'react';

// Synodic month in days
const SYNODIC_MONTH = 29.53058867;

// Reference new moon: January 6, 2000 18:14 UTC
const REFERENCE_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();

function getMoonAge(date: Date): number {
    const diff = date.getTime() - REFERENCE_NEW_MOON;
    const days = diff / (1000 * 60 * 60 * 24);
    return ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
}

interface MoonPhase {
    name: string;
    emoji: string;
    illumination: number;
}

function getMoonPhase(date: Date): MoonPhase {
    const age = getMoonAge(date);
    const fraction = age / SYNODIC_MONTH;
    // Illumination: 0 at new moon, 1 at full moon
    const illumination = Math.round((1 - Math.cos(2 * Math.PI * fraction)) / 2 * 100);

    if (age < 1.85) return { name: 'Neumond', emoji: '🌑', illumination };
    if (age < 7.38) return { name: 'Zunehmende Sichel', emoji: '🌒', illumination };
    if (age < 9.23) return { name: 'Erstes Viertel', emoji: '🌓', illumination };
    if (age < 13.77) return { name: 'Zunehmender Mond', emoji: '🌔', illumination };
    if (age < 15.62) return { name: 'Vollmond', emoji: '🌕', illumination };
    if (age < 20.15) return { name: 'Abnehmender Mond', emoji: '🌖', illumination };
    if (age < 22.00) return { name: 'Letztes Viertel', emoji: '🌗', illumination };
    if (age < 27.69) return { name: 'Abnehmende Sichel', emoji: '🌘', illumination };
    return { name: 'Neumond', emoji: '🌑', illumination };
}

function getNextFullMoon(from: Date): Date {
    const age = getMoonAge(from);
    const fullMoonAge = SYNODIC_MONTH / 2; // ~14.77 days
    let daysUntil = fullMoonAge - age;
    if (daysUntil < 0) daysUntil += SYNODIC_MONTH;
    return new Date(from.getTime() + daysUntil * 24 * 60 * 60 * 1000);
}

function getNextNewMoon(from: Date): Date {
    const age = getMoonAge(from);
    let daysUntil = SYNODIC_MONTH - age;
    if (daysUntil < 0.5) daysUntil += SYNODIC_MONTH;
    return new Date(from.getTime() + daysUntil * 24 * 60 * 60 * 1000);
}

export const MoonWidget: React.FC = () => {
    const [now, setNow] = useState(new Date());

    useEffect(() => {
        // Update every minute
        const timer = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(timer);
    }, []);

    const { phase, nextFull, nextNew } = useMemo(() => {
        const phase = getMoonPhase(now);
        const nextFull = getNextFullMoon(now);
        const nextNew = getNextNewMoon(now);
        return { phase, nextFull, nextNew };
    }, [Math.floor(now.getTime() / 60000)]); // Recalc every minute

    const formatDate = (d: Date) =>
        d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

    const daysUntilFull = Math.ceil((nextFull.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const daysUntilNew = Math.ceil((nextNew.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return (
        <div className="flex flex-col p-4 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl border border-slate-300 dark:border-slate-700 h-full items-center justify-center">
            <div className="text-5xl mb-2">{phase.emoji}</div>
            <div className="text-lg font-bold text-slate-900 dark:text-white">{phase.name}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400">{phase.illumination}% beleuchtet</div>

            <div className="mt-3 flex gap-4 text-xs text-slate-400 dark:text-slate-500">
                <div className="text-center">
                    <div className="text-slate-500 dark:text-slate-400 font-semibold">Vollmond</div>
                    <div>{daysUntilFull <= 0 ? 'Heute' : `in ${daysUntilFull}d`} ({formatDate(nextFull)})</div>
                </div>
                <div className="text-center">
                    <div className="text-slate-500 dark:text-slate-400 font-semibold">Neumond</div>
                    <div>{daysUntilNew <= 0 ? 'Heute' : `in ${daysUntilNew}d`} ({formatDate(nextNew)})</div>
                </div>
            </div>
        </div>
    );
};
