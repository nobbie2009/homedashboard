import React, { useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { useGoogleEvents, occursOnDay, CalendarEvent } from '../../hooks/useGoogleEvents';
import { MapPin, Cake, CalendarClock } from 'lucide-react';

/** Termine ohne Uhrzeit dürfen keine erfundene Zeit anzeigen. */
const EventTime: React.FC<{ event: CalendarEvent; isPast: boolean }> = ({ event, isPast }) => {
    const strong = isPast ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white';

    if (event.allDay) {
        return (
            <div className="flex flex-col w-20 text-center border-r border-slate-300 dark:border-slate-600 pr-3 mr-3">
                <span className={`text-[11px] font-bold uppercase leading-tight ${strong}`}>Ganztägig</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-20 text-center border-r border-slate-300 dark:border-slate-600 pr-3 mr-3">
            <span className={`text-2xl font-bold tabular-nums ${strong}`}>{format(event.start, 'HH:mm')}</span>
            <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">{format(event.end, 'HH:mm')}</span>
        </div>
    );
};

interface AgendaWidgetProps {
    /** Meldet dem Dashboard, ob heute etwas ansteht — leer darf die Spalte schmaler werden. */
    onEmptyChange?: (isEmpty: boolean) => void;
}

export const AgendaWidget: React.FC<AgendaWidgetProps> = ({ onEmptyChange }) => {
    const { events, loading, error } = useGoogleEvents({ scope: 'today' });

    const todaysEvents = useMemo(() => {
        const today = new Date();
        return events
            .filter(e => occursOnDay(e, today))
            .sort((a, b) => a.start.getTime() - b.start.getTime());
    }, [events]);

    const isEmpty = !loading && !error && todaysEvents.length === 0;
    useEffect(() => {
        onEmptyChange?.(isEmpty);
    }, [isEmpty, onEmptyChange]);

    return (
        <div className="widget-card flex flex-col p-4 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl backdrop-blur-sm shadow-lg w-full h-full border border-slate-300 dark:border-slate-700 overflow-hidden">
            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-3 uppercase tracking-wider">Heute</h3>
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                {error === 'AUTH_REQUIRED' ? (
                    <div className="flex flex-col items-center justify-center h-full text-amber-400 space-y-3 p-4">
                        <span className="font-bold text-lg text-center">Google Login Abgelaufen</span>
                        <span className="text-sm text-center text-slate-600 dark:text-slate-300">Bitte im Admin-Menü neu verbinden.</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-red-400 space-y-2">
                        <span className="font-bold">Fehler</span>
                        <span className="text-xs text-center px-4">{error}</span>
                    </div>
                ) : loading && todaysEvents.length === 0 ? (
                    <div className="text-slate-400 dark:text-slate-500 text-center mt-10 animate-pulse text-lg">Lade Termine...</div>
                ) : todaysEvents.length === 0 ? (
                    // Bewusst nur eine ruhige Notiz: Was als Nächstes ansteht,
                    // steht direkt daneben in der Wochenübersicht — doppelt
                    // gezeigt wäre es genau die Unruhe, die wir vermeiden wollen.
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 dark:text-slate-500">
                        <CalendarClock className="w-10 h-10 opacity-50" />
                        <span className="text-lg">Keine Termine heute</span>
                    </div>
                ) : (
                    todaysEvents.map(event => {
                        const isPast = event.end < new Date();
                        const color = event.color || '#3b82f6';

                        return (
                            <div
                                key={event.id}
                                className={`flex items-center p-3 bg-slate-300/50 dark:bg-slate-700/50 rounded-lg border-l-4 transition hover:bg-slate-300 dark:hover:bg-slate-700 ${isPast ? 'opacity-50 grayscale' : ''}`}
                                style={{ borderLeftColor: color }}
                            >
                                <EventTime event={event} isPast={isPast} />
                                <div className="flex-1 min-w-0">
                                    <div className={`font-medium text-xl leading-tight truncate ${isPast ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>{event.title}</div>
                                    <div className="flex flex-col mt-1 space-y-0.5">
                                        {(event.location || event.isBirthday) && (
                                            <div className="flex items-center text-sm text-slate-500 dark:text-slate-400 truncate">
                                                {event.isBirthday ? (
                                                    <Cake className="w-3.5 h-3.5 mr-1 text-pink-400" />
                                                ) : (
                                                    <MapPin className="w-3.5 h-3.5 mr-1" />
                                                )}
                                                <span className="truncate">{event.location || (event.isBirthday ? 'Geburtstag' : '')}</span>
                                            </div>
                                        )}
                                        {event.description && (
                                            <div className="text-sm text-slate-400 dark:text-slate-500 truncate italic">
                                                {event.description}
                                            </div>
                                        )}
                                        {/* Fallback removed as per request */}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
