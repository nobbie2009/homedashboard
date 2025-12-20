import { useState, useEffect, useCallback } from 'react';
import { useConfig, CalendarScope } from '../contexts/ConfigContext';
import { useSecurity } from '../contexts/SecurityContext'; // Import useSecurity
import { getApiUrl } from '../utils/api';

// Define types
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

export interface UseGoogleEventsOptions {
    timeMin?: string;
    timeMax?: string;
    enabled?: boolean;
    scope?: CalendarScope;
}

// Simple in-memory cache
const rawEventCache: Record<string, { timestamp: number, data: any[] }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes


export const useGoogleEvents = (options: UseGoogleEventsOptions = {}) => {
    const { config } = useConfig();
    const { deviceId } = useSecurity(); // Get deviceId
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const API_URL = getApiUrl();

    const fetchEvents = useCallback(async (force = false) => {
        const selected = config.google?.selectedCalendars || [];

        // If no calendars selected or explicitly disabled, clear events
        if (selected.length === 0 || options.enabled === false) {
            setEvents([]);
            return;
        }

        const cacheKey = JSON.stringify({
            selected,
            timeMin: options.timeMin,
            timeMax: options.timeMax
        });

        let rawData: any[] = [];
        let usedCache = false;

        // check cache
        if (!force && rawEventCache[cacheKey]) {
            const entry = rawEventCache[cacheKey];
            if (Date.now() - entry.timestamp < CACHE_TTL) {
                rawData = entry.data;
                usedCache = true;
            }
        }

        if (!usedCache) {
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
                    headers: {
                        'Content-Type': 'application/json',
                        'x-device-id': deviceId // Add header
                    },
                    body: JSON.stringify(body)
                });


                if (res.ok) {
                    rawData = await res.json();
                    // Update Cache with RAW data
                    rawEventCache[cacheKey] = { timestamp: Date.now(), data: rawData };
                } else {
                    setError("Failed to fetch events");
                    return;
                }
            } catch (err) {
                console.error("Failed to fetch events", err);
                setError("Network error");
                return;
            } finally {
                setLoading(false);
            }
        }

        // --- POST-PROCESSING (Mapping & Filtering) ---
        // This runs on both Cached and New data, ensuring config changes are applied immediately.

        if (rawData) {
            let mapped: CalendarEvent[] = rawData.map((e: any) => {
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
                    // Safe check for scope
                    if (settings && settings.scopes) {
                        // If explicitely false, exclude. If undefined/true, include.
                        const scopeVal = settings.scopes[options.scope!];
                        return scopeVal !== false;
                    }
                    return true;
                });
            }

            // Sort by start time
            mapped.sort((a, b) => a.start.getTime() - b.start.getTime());

            setEvents(mapped);
        }

    }, [config.google?.selectedCalendars, config.google?.calendarColors, config.google?.calendarSettings, options.enabled, options.timeMin, options.timeMax, options.scope, deviceId]);

    // Initial fetch
    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    const refresh = useCallback(() => fetchEvents(true), [fetchEvents]);

    return { events, loading, error, refresh };
};
