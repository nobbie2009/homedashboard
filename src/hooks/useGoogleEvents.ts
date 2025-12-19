import { useState, useEffect, useCallback } from 'react';
import { useConfig, CalendarScope } from '../contexts/ConfigContext';
import { getApiUrl } from '../utils/api';

export interface CalendarEvent {
    id: string;
    title: string;
    start: Date;
    end: Date;
    calendarId: string;
    description?: string;
    location?: string;
    color?: string;
    calendarName?: string; // Alias or ID
}

interface UseGoogleEventsOptions {
    timeMin?: string;
    timeMax?: string;
    enabled?: boolean;
    scope?: CalendarScope;
}

export const useGoogleEvents = (options: UseGoogleEventsOptions = {}) => {
    const { config } = useConfig();
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const API_URL = getApiUrl();

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
                let mapped: CalendarEvent[] = data.map((e: any) => {
                    const calId = e.calendarId || 'google';
                    const settings = config.google?.calendarSettings?.[calId];

                    // Fallback to old color config or default
                    const color = settings?.color || config.google?.calendarColors?.[calId] || '#3b82f6';
                    const alias = settings?.alias || calId;

                    return {
                        id: e.id,
                        title: e.summary || "Kein Titel",
                        start: new Date(e.start.dateTime || e.start.date),
                        end: new Date(e.end.dateTime || e.end.date),
                        calendarId: calId,
                        description: e.description,
                        location: e.location,
                        color: color,
                        calendarName: alias
                    };
                });

                // Filter by Scope if provided
                if (options.scope && config.google?.calendarSettings) {
                    mapped = mapped.filter(e => {
                        const settings = config.google?.calendarSettings?.[e.calendarId];
                        // If settings exist, check scope. If NOT exist, default to TRUE (backward compat)
                        if (settings) {
                            return settings.scopes[options.scope!];
                        }
                        return true;
                    });
                }

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
    }, [config.google?.selectedCalendars, config.google?.calendarColors, config.google?.calendarSettings, options.enabled, options.timeMin, options.timeMax, options.scope]);

    // Initial fetch
    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    return { events, loading, error, refresh: fetchEvents };
};
