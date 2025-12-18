import React, { useState, useEffect } from 'react';
import { format, addDays, isSameDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { useConfig } from '../../contexts/ConfigContext';

interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    calendarId: string;
    color: string;
}

export const WeekWidget: React.FC = () => {
    const { config } = useConfig();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);

    // Use env var or default to localhost
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

    useEffect(() => {
        const fetchEvents = async () => {
            const selected = config.google?.selectedCalendars || [];
            if (selected.length === 0) {
                setEvents([]);
                return;
            }

            setLoading(true);
            try {
                const res = await fetch(`${API_URL}/api/google/events`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ calendarIds: selected })
                });
                if (res.ok) {
                    const data = await res.json();
                    const mapped: CalendarEvent[] = data.map((e: any) => ({
                        id: e.id,
                        title: e.summary || "Kein Titel",
                        start: new Date(e.start.dateTime || e.start.date),
                        end: new Date(e.end.dateTime || e.end.date),
                        calendarId: e.calendarId || 'google',
                        color: 'bg-blue-500' // Placeholder
                    }));
                    setEvents(mapped);
                }
            } catch (err) {
                console.error("Failed to fetch events", err);
            } finally {
                setLoading(false);
            }
        };

        fetchEvents();
        // Refresh every 10 minutes
        const interval = setInterval(fetchEvents, 600000);
        return () => clearInterval(interval);
    }, [config.google?.selectedCalendars]);

    // Generate next 5 days
    const nextDays = Array.from({ length: 5 }, (_, i) => addDays(new Date(), i)); // Today + 4 days

    return (
        <div className="flex flex-col p-4 bg-slate-800/50 rounded-xl backdrop-blur-sm shadow-lg w-full h-full border border-slate-700 overflow-hidden">
            <h3 className="text-lg font-semibold text-slate-300 mb-3 uppercase tracking-wider">Wochenübersicht</h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4">
                {nextDays.map(day => {
                    const dayEvents = events.filter(e => isSameDay(e.start, day));
                    if (dayEvents.length === 0) return null; // Skip empty days or show placeholder? Let's skip for compactness

                    return (
                        <div key={day.toISOString()} className="border-l-2 border-slate-600 pl-3">
                            <div className="text-sm font-bold text-blue-400 mb-1 capitalize">
                                {format(day, 'EEEE, d. MMM', { locale: de })}
                            </div>
                            <div className="space-y-1">
                                {dayEvents.map(e => (
                                    <div key={e.id} className="text-sm text-slate-300 truncate">
                                        <span className="text-slate-500 mr-2">{format(e.start, 'HH:mm')}</span>
                                        {e.title}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}

                {loading && events.length === 0 && (
                    <div className="text-slate-500 text-center text-sm animate-pulse">Lade...</div>
                )}

                {!loading && events.length === 0 && (
                    <div className="text-slate-500 text-center text-sm pt-4">Keine Termine</div>
                )}
            </div>
        </div>
    );
};
