import React from 'react';
import { format, addDays, isTomorrow } from 'date-fns';
import { de } from 'date-fns/locale';
import { useConfig } from '../../contexts/ConfigContext';
import { useGoogleEvents, occursOnDay } from '../../hooks/useGoogleEvents';
import { Cake } from 'lucide-react';

/** „Morgen" statt Datum — spart Lesezeit beim Vorbeigehen. */
const dayLabel = (day: Date) =>
    isTomorrow(day) ? 'Morgen' : format(day, 'EEEE, d. MMM', { locale: de });

export const WeekWidget: React.FC = () => {
    const { config } = useConfig();
    const { events, loading, error } = useGoogleEvents({ scope: 'weekWidget' });

    // Ab morgen: Heute steht bereits ausführlich in der Spalte daneben, eine
    // zweite Liste derselben Termine macht das Dashboard nur unruhiger.
    const nextDays = Array.from({ length: 5 }, (_, i) => addDays(new Date(), i + 1));

    const daysWithEvents = nextDays
        .map(day => ({ day, dayEvents: events.filter(e => occursOnDay(e, day)) }))
        .filter(({ dayEvents }) => dayEvents.length > 0);

    return (
        <div className="widget-card flex flex-col p-4 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl backdrop-blur-sm shadow-lg w-full h-full border border-slate-300 dark:border-slate-700 overflow-hidden">
            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-3 uppercase tracking-wider">Wochenübersicht</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
                {daysWithEvents.map(({ day, dayEvents }) => (
                    <div key={day.toISOString()}>
                        <div className={`text-lg font-bold mb-1.5 capitalize ${isTomorrow(day) ? 'text-blue-500 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                            {dayLabel(day)}
                        </div>
                        <div className="space-y-1">
                            {dayEvents.map(e => {
                                const color = config.google?.calendarColors?.[e.calendarId] || '#60a5fa';
                                return (
                                    <div key={e.id} className="text-base text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                        {e.isBirthday ? (
                                            <Cake className="w-3.5 h-3.5 flex-shrink-0 text-pink-400" />
                                        ) : (
                                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></div>
                                        )}
                                        <span className={`text-slate-400 dark:text-slate-500 w-16 flex-shrink-0 tabular-nums ${e.allDay ? 'text-[11px] uppercase tracking-wide' : 'text-sm'}`}>
                                            {e.allDay ? 'ganztägig' : format(e.start, 'HH:mm')}
                                        </span>
                                        <span className="truncate">{e.title}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {error ? (
                    <div className="text-red-400 text-center text-sm pt-4">
                        Fehler: {error}
                    </div>
                ) : loading && events.length === 0 ? (
                    <div className="text-slate-400 dark:text-slate-500 text-center text-sm animate-pulse">Lade...</div>
                ) : daysWithEvents.length === 0 && (
                    <div className="text-slate-400 dark:text-slate-500 text-center text-sm pt-4">Keine Termine</div>
                )}
            </div>
        </div>
    );
};
