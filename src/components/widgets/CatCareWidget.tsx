import React from 'react';
import clsx from 'clsx';
import { Cat, Trash2 } from 'lucide-react';
import { useCatCare } from '../../hooks/useCatCare';

interface Props {
    variant?: 'header' | 'screensaver';
    className?: string;
}

/**
 * Compact status pills for feeding + litter.
 *
 * - Red = due (offene Fütterung im Grace-Fenster, oder Klo fällig)
 * - Green = erledigt / nichts offen
 * - Click toggles state via backend.
 */
export const CatCareWidget: React.FC<Props> = ({ variant = 'header', className }) => {
    const { status, feed, undoFeed, cleanLitter } = useCatCare();

    if (!status || !status.enabled) return null;

    const feedingDue = status.feeding.due;
    const feedingCompletedToday = status.feeding.completedToday.length;
    const feedingTotal = status.feeding.times.length;
    const allFeedingDone = status.feeding.allCompleted;

    const litterEnabled = status.litter.enabled;
    const litterDue = status.litter.due;

    const onFeedingClick = async () => {
        // Wenn etwas fällig ist: als erledigt markieren.
        // Wenn alle erledigt: letzten Eintrag rückgängig machen (Touch-Schutz durch „sicher?" könnte man einbauen, bleibt hier schlicht).
        if (feedingDue || !allFeedingDone) {
            await feed();
        } else {
            await undoFeed();
        }
    };

    const onLitterClick = async () => {
        await cleanLitter();
    };

    const sizeClasses = variant === 'screensaver'
        ? 'w-10 h-10 text-base'
        : 'w-11 h-11 text-sm';
    const iconSize = variant === 'screensaver' ? 'w-5 h-5' : 'w-6 h-6';

    return (
        <div className={clsx('flex items-center gap-2', className)}>
            {/* Feeding */}
            <button
                onClick={onFeedingClick}
                title={
                    feedingDue
                        ? `Futter fällig (${status.feeding.nextOpenInReach || ''})`
                        : allFeedingDone
                            ? 'Alle Fütterungen erledigt – Tap zum Rückgängigmachen'
                            : `Nächste Fütterung: ${status.feeding.nextScheduledOpen || '—'}`
                }
                className={clsx(
                    'relative flex items-center justify-center rounded-full shadow-md border-2 transition-all duration-200 active:scale-90',
                    sizeClasses,
                    feedingDue
                        ? 'bg-red-500/90 border-red-300 text-white hover:bg-red-500 animate-pulse'
                        : allFeedingDone
                            ? 'bg-green-500/90 border-green-300 text-white hover:bg-green-500'
                            : 'bg-slate-400/80 border-slate-200 text-white hover:bg-slate-500'
                )}
            >
                <Cat className={iconSize} />
                {feedingTotal > 1 && (
                    <span className="absolute -bottom-1 -right-1 bg-slate-900/90 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center border border-slate-700">
                        {feedingCompletedToday}/{feedingTotal}
                    </span>
                )}
            </button>

            {/* Litter (optional) */}
            {litterEnabled && (
                <button
                    onClick={onLitterClick}
                    title={
                        litterDue
                            ? 'Katzenklo reinigen'
                            : status.litter.nextDueAt
                                ? `Nächste Reinigung: ${new Date(status.litter.nextDueAt).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`
                                : 'Katzenklo'
                    }
                    className={clsx(
                        'flex items-center justify-center rounded-full shadow-md border-2 transition-all duration-200 active:scale-90',
                        sizeClasses,
                        litterDue
                            ? 'bg-red-500/90 border-red-300 text-white hover:bg-red-500 animate-pulse'
                            : 'bg-green-500/90 border-green-300 text-white hover:bg-green-500'
                    )}
                >
                    <Trash2 className={iconSize} />
                </button>
            )}
        </div>
    );
};
