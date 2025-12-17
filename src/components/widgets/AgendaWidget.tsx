import React, { useState, useEffect } from 'react';
import { format, isSameDay } from 'date-fns';
import { useConfig } from '../../contexts/ConfigContext';

interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    calendarId: string;
    color: string;
}

export const AgendaWidget: React.FC = () => {
    const { config } = useConfig();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchEvents = async () => {
            const selected = config.google?.selectedCalendars || [];
            if (selected.length === 0) {
                setEvents([]);
                return;
            }

            setLoading(true);
            try {
                const res = await fetch('http://localhost:3001/api/google/events', {
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
                        color: 'bg-blue-500' // Placeholder, could map calendarId to colors
                    }));

                    // Filter for TODAY only (Agenda view)
                    const today = new Date();
                    const todaysEvents = mapped
                        .filter(e => isSameDay(e.start, today))
                        .sort((a, b) => a.start.getTime() - b.start.getTime());

                    setEvents(todaysEvents);
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

    return (
        <div className="flex flex-col p-4 bg-slate-800/50 rounded-xl backdrop-blur-sm shadow-lg w-full h-full border border-slate-700 overflow-hidden">
            <h3 className="text-lg font-semibold text-slate-300 mb-3 uppercase tracking-wider">Heute</h3>
            <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar">
                {loading && events.length === 0 ? (
                    <div className="text-slate-500 text-center mt-10 animate-pulse">Lade Termine...</div>
                ) : events.length === 0 ? (
                    <div className="text-slate-500 text-center mt-10">Keine Termine heute</div>
                ) : (
                    events.map(event => (
                        <div key={event.id} className="flex items-center p-3 bg-slate-700/50 rounded-lg border-l-4 border-l-blue-500 transition hover:bg-slate-700">
                            <div className="flex flex-col w-16 text-center border-r border-slate-600 pr-3 mr-3">
                                <span className="text-xl font-bold text-white">{format(event.start, 'HH:mm')}</span>
                                <span className="text-xs text-slate-400">{format(event.end, 'HH:mm')}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-white font-medium text-lg leading-tight truncate">{event.title}</div>
                                <div className="text-xs text-slate-400 mt-1 uppercase truncate">{event.calendarId}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
