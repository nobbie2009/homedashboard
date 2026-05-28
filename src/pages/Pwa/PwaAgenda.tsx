import React, { useMemo } from 'react';
import { MapPin, Cake, CalendarDays, RefreshCw } from 'lucide-react';
import { useGoogleEvents, CalendarEvent } from '../../hooks/useGoogleEvents';
import { useConfig } from '../../contexts/ConfigContext';
import { Skeleton } from '../../components/Skeleton';

const DAY_MS = 86400000;
const HORIZON_DAYS = 21;

// Google all-day events arrive as date-only -> midnight UTC with a duration
// that's a whole number of days. Detect that to avoid showing a bogus "02:00".
function isAllDay(e: CalendarEvent): boolean {
    return (
        e.start.getUTCHours() === 0 &&
        e.start.getUTCMinutes() === 0 &&
        e.end.getTime() > e.start.getTime() &&
        (e.end.getTime() - e.start.getTime()) % DAY_MS === 0
    );
}

// Day bucket the event belongs to (UTC components for all-day, local otherwise).
function dayStart(e: CalendarEvent): Date {
    return isAllDay(e)
        ? new Date(e.start.getUTCFullYear(), e.start.getUTCMonth(), e.start.getUTCDate())
        : new Date(e.start.getFullYear(), e.start.getMonth(), e.start.getDate());
}

function dayLabel(date: Date, today: Date, tomorrow: Date): string {
    if (date.getTime() === today.getTime()) return 'Heute';
    if (date.getTime() === tomorrow.getTime()) return 'Morgen';
    return date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short' });
}

interface DayGroup {
    key: number;
    label: string;
    events: CalendarEvent[];
}

export const PwaAgenda: React.FC = () => {
    const { config } = useConfig();
    const now = new Date();
    // Day-stable range so the hook's cache key doesn't change on every render.
    const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const timeMin = today0.toISOString();
    const timeMax = new Date(today0.getTime() + HORIZON_DAYS * DAY_MS).toISOString();

    const { events, loading, error, refresh } = useGoogleEvents({ timeMin, timeMax });

    const hasCalendars = (config.google?.selectedCalendars?.length || 0) > 0;

    const groups = useMemo<DayGroup[]>(() => {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today.getTime() + DAY_MS);
        const map = new Map<number, CalendarEvent[]>();
        for (const e of events) {
            // Skip timed events that already ended today.
            if (!isAllDay(e) && e.end.getTime() < now.getTime()) continue;
            const key = dayStart(e).getTime();
            const list = map.get(key);
            if (list) list.push(e);
            else map.set(key, [e]);
        }
        return [...map.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([key, evs]) => ({
                key,
                label: dayLabel(new Date(key), today, tomorrow),
                events: evs.sort((a, b) => a.start.getTime() - b.start.getTime()),
            }));
    }, [events]);

    return (
        <div className="p-4 max-w-xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-blue-500" /> Kalender
                </h2>
                <button
                    onClick={refresh}
                    aria-label="Aktualisieren"
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 active:scale-95"
                >
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {!hasCalendars ? (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200 rounded-lg p-4 text-sm">
                    Keine Kalender ausgewählt. Bitte im Admin einen Google-Kalender verbinden.
                </div>
            ) : error === 'AUTH_REQUIRED' ? (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 rounded-lg p-4 text-sm">
                    Google-Login abgelaufen. Bitte im Admin-Menü neu verbinden.
                </div>
            ) : error ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg p-4 text-sm">
                    Termine konnten nicht geladen werden.
                </div>
            ) : loading && events.length === 0 ? (
                <div className="space-y-3">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="space-y-2">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-16 w-full" />
                        </div>
                    ))}
                </div>
            ) : groups.length === 0 ? (
                <div className="text-center text-slate-500 dark:text-slate-400 py-10">
                    Keine anstehenden Termine.
                </div>
            ) : (
                groups.map(group => (
                    <section key={group.key} className="space-y-2">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 sticky top-0 bg-slate-50 dark:bg-slate-950 py-1">
                            {group.label}
                        </h3>
                        <div className="space-y-2">
                            {group.events.map(event => {
                                const allDay = isAllDay(event);
                                const color = event.color || '#3b82f6';
                                return (
                                    <div
                                        key={event.id}
                                        className="flex items-stretch gap-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 border-l-4 p-3"
                                        style={{ borderLeftColor: color }}
                                    >
                                        <div className="w-16 flex-none text-center">
                                            {allDay ? (
                                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                                    Ganztägig
                                                </span>
                                            ) : (
                                                <>
                                                    <div className="text-base font-bold tabular-nums">
                                                        {event.start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                    <div className="text-xs text-slate-400 tabular-nums">
                                                        {event.end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 border-l border-slate-200 dark:border-slate-700 pl-3">
                                            <div className="font-semibold truncate">{event.title}</div>
                                            {event.calendarName && (
                                                <div className="text-[11px] text-slate-400 truncate">{event.calendarName}</div>
                                            )}
                                            {(event.location || event.isBirthday) && (
                                                <div className="flex items-center text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                                    {event.isBirthday ? (
                                                        <Cake className="w-3.5 h-3.5 mr-1 text-pink-400 flex-none" />
                                                    ) : (
                                                        <MapPin className="w-3.5 h-3.5 mr-1 flex-none" />
                                                    )}
                                                    <span className="truncate">{event.location || 'Geburtstag'}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))
            )}
        </div>
    );
};
