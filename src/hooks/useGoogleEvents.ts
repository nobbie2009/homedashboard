import { useState, useEffect, useCallback } from 'react';
import { useConfig } from '../contexts/ConfigContext';

export interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    calendarId: string;
    description?: string;
    location?: string;
    color?: string;
}

interface UseGoogleEventsOptions {
    timeMin?: string;
    timeMax?: string;
    enabled?: boolean;
}

export const useGoogleEvents = (options: UseGoogleEventsOptions = {}) => {
    const { config } = useConfig();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

    const fetchEvents = useCallback(async () => {
        const selected = config.google?.selectedCalendars || [];

        // If no calendars selected or explicitly disabled, clear events
        if (selected.length === 0 || options.enabled === false) {
            setEvents([]);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const body = {
                calendarIds: selected,
                ...(options.timeMin && { timeMin: options.timeMin }),
                ...(options.timeMax && { timeMax: options.timeMax })
            };

            const res = await fetch(`${API_URL}/api/google/events`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                const data = await res.json();
                const mapped: CalendarEvent[] = data.map((e: any) => ({
                    id: e.id,
                    title: e.summary || "Kein Titel",
                    start: new Date(e.start.dateTime || e.start.date),
                    end: new Date(e.end.dateTime || e.end.date),
                    calendarId: e.calendarId || 'google',
                    description: e.description,
                    location: e.location,
                    color: config.google?.calendarColors?.[e.calendarId] || '#3b82f6'
                }));

                // Sort by start time
                mapped.sort((a, b) => a.start.getTime() - b.start.getTime());

                setEvents(mapped);
            } else {
                setError("Failed to fetch events");
            }
        } catch (err) {
            console.error("Failed to fetch events", err);
            setError("Network error");
        } finally {
            setLoading(false);
        }
    }, [config.google?.selectedCalendars, config.google?.calendarColors, options.enabled, options.timeMin, options.timeMax]);

    // Initial fetch
    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    return { events, loading, error, refresh: fetchEvents };
};
