import React, { useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import { useGoogleEvents } from '../../hooks/useGoogleEvents';
import { MapPin } from 'lucide-react';

export const AgendaWidget: React.FC = () => {
    const { events, loading, error } = useGoogleEvents({ scope: 'today' });

    const todaysEvents = useMemo(() => {
        const today = new Date();
        return events
            .filter(e => isSameDay(e.start, today))
            .sort((a, b) => a.start.getTime() - b.start.getTime());
    }, [events]);

    return (
        <div className="flex flex-col p-4 bg-slate-800/50 rounded-xl backdrop-blur-sm shadow-lg w-full h-full border border-slate-700 overflow-hidden">
            <h3 className="text-xl font-semibold text-slate-300 mb-3 uppercase tracking-wider">Heute</h3>
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                {error === 'AUTH_REQUIRED' ? (
                    <div className="flex flex-col items-center justify-center h-full text-amber-400 space-y-3 p-4">
                        <span className="font-bold text-lg text-center">Google Login Abgelaufen</span>
                        <span className="text-sm text-center text-slate-300">Bitte im Admin-Menü neu verbinden.</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-red-400 space-y-2">
                        <span className="font-bold">Fehler</span>
                        <span className="text-xs text-center px-4">{error}</span>
                    </div>
                ) : loading && todaysEvents.length === 0 ? (
                    <div className="text-slate-500 text-center mt-10 animate-pulse text-lg">Lade Termine...</div>
                ) : todaysEvents.length === 0 ? (
                    <div className="text-slate-500 text-center mt-10 text-lg">Keine Termine heute</div>
                ) : (
                    todaysEvents.map(event => {
                        const isPast = event.end < new Date();
                        const color = event.color || '#3b82f6';

                        return (
                            <div
                                key={event.id}
                                className={`flex items-center p-3 bg-slate-700/50 rounded-lg border-l-4 transition hover:bg-slate-700 ${isPast ? 'opacity-50 grayscale' : ''}`}
                                style={{ borderLeftColor: color }}
                            >
                                <div className="flex flex-col w-20 text-center border-r border-slate-600 pr-3 mr-3">
                                    <span className={`text-2xl font-bold ${isPast ? 'text-slate-400' : 'text-white'}`}>{format(event.start, 'HH:mm')}</span>
                                    <span className="text-sm text-slate-400">{format(event.end, 'HH:mm')}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className={`font-medium text-xl leading-tight truncate ${isPast ? 'text-slate-400' : 'text-white'}`}>{event.title}</div>
                                    <div className="flex flex-col mt-1 space-y-0.5">
                                        {event.location && (
                                            <div className="flex items-center text-sm text-slate-400 truncate">
                                                <MapPin className="w-3.5 h-3.5 mr-1" />
                                                <span className="truncate">{event.location}</span>
                                            </div>
                                        )}
                                        {event.description && (
                                            <div className="text-sm text-slate-500 truncate italic">
                                                {event.description}
                                            </div>
                                        )}
                                        {!event.location && !event.description && (
                                            <div className="text-sm text-slate-500 truncate opacity-50">
                                                {event.calendarId}
                                            </div>
                                        )}
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
