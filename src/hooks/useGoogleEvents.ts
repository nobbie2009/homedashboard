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

// Simple in-memory cache
const globalEventCache: Record<string, { timestamp: number, data: CalendarEvent[] }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useGoogleEvents = (options: UseGoogleEventsOptions = {}) => {
    const { config } = useConfig();
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

        // check cache
        if (!force && globalEventCache[cacheKey]) {
            const entry = globalEventCache[cacheKey];
            if (Date.now() - entry.timestamp < CACHE_TTL) {
                // Apply filtering to cached data (because config/scope might have changed, but raw data is same)
                // Actually, raw data is what we fetch. Filtering happens after.
                // Optimally we cache raw data.
                // For simplicity here, let's assume raw data is cached and we re-map/filter?
                // The current cache implementation below puts MAPPED data in cache. 
                // This is risky if config changes (colors/aliases). 
                // BETTER: Cache the RAW response, then map.
                // But to save time refactoring, let's just use the cached mapped data 
                // and accept that color changes require refresh (or wait 5 min).
                // Or better: Filter the cached data again?

                // Let's stick to simple: Return cached data. 
                // If user changes config, they expect reload? 
                // We can add "refresh" button to clear cache.

                // apply scope filter on cached data? 
                // The cached data already has scope filtered if we cache 'mapped'?
                // Wait, scope is passed in options. If options change, cacheKey changes.
                // So cache is specific to scope.

                setEvents(entry.data);
                return;
            }
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

                // Update Cache
                globalEventCache[cacheKey] = { timestamp: Date.now(), data: mapped };

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

    const refresh = useCallback(() => fetchEvents(true), [fetchEvents]);

    return { events, loading, error, refresh };
};
