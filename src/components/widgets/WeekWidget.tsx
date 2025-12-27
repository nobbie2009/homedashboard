import React from 'react';
import { format, addDays, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { useConfig } from '../../contexts/ConfigContext';
import { useGoogleEvents } from '../../hooks/useGoogleEvents';
import { Cake } from 'lucide-react';

export const WeekWidget: React.FC = () => {
    const { config } = useConfig();
    const { events, loading, error } = useGoogleEvents({ scope: 'weekWidget' });

    // Generate next 5 days
    const nextDays = Array.from({ length: 5 }, (_, i) => addDays(new Date(), i)); // Today + 4 days

    return (
        <div className="flex flex-col p-4 bg-slate-800/50 rounded-xl backdrop-blur-sm shadow-lg w-full h-full border border-slate-700 overflow-hidden">
            <h3 className="text-xl font-semibold text-slate-300 mb-3 uppercase tracking-wider">Wochenübersicht</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
                {nextDays.map(day => {
                    const dayEvents = events.filter(e => isSameDay(e.start, day));
                    if (dayEvents.length === 0) return null; // Skip empty days or show placeholder? Let's skip for compactness

                    return (
                        <div key={day.toISOString()} className="border-l-2 border-slate-600 pl-3">
                            <div className="text-lg font-bold text-blue-400 mb-1 capitalize">
                                {format(day, 'EEEE, d. MMM', { locale: de })}
                            </div>
                            <div className="space-y-1">
                                {dayEvents.map(e => {
                                    const color = config.google?.calendarColors?.[e.calendarId] || '#60a5fa';
                                    return (
                                        <div key={e.id} className="text-base text-slate-300 truncate flex items-center">
                                            {e.isBirthday ? (
                                                <Cake className="w-3.5 h-3.5 mr-2 text-pink-400" />
                                            ) : (
                                                <div className="w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: color }}></div>
                                            )}
                                            <span className="text-slate-500 mr-2 w-12">{format(e.start, 'HH:mm')}</span>
                                            <span className="truncate">{e.title}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                {error ? (
                    <div className="text-red-400 text-center text-sm pt-4">
                        Fehler: {error}
                    </div>
                ) : loading && events.length === 0 && (
                    <div className="text-slate-500 text-center text-sm animate-pulse">Lade...</div>
                )}

                {!loading && events.length === 0 && (
                    <div className="text-slate-500 text-center text-sm pt-4">Keine Termine</div>
                )}
            </div>
        </div>
    );
};
