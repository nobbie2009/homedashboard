import React, { useState, useEffect, useRef } from 'react';
import {
    format,
    startOfWeek,
    addDays,
    addWeeks,
    subWeeks,
    isSameDay,
    isToday,
    getHours,
    getMinutes,
    differenceInMinutes
} from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import clsx from 'clsx';
import { useGoogleEvents, CalendarEvent } from '../../hooks/useGoogleEvents';

// Constants for layout
const HOUR_HEIGHT = 60; // pixels per hour

// --- Helper for Layout (Overlapping Events) ---
interface LayoutEvent extends CalendarEvent {
    style: React.CSSProperties;
}

const layoutEvents = (events: CalendarEvent[]): LayoutEvent[] => {
    // 1. Sort by start time, then duration (longest first)
    const sorted = [...events].sort((a, b) => {
        if (a.start.getTime() === b.start.getTime()) {
            return (b.end.getTime() - b.start.getTime()) - (a.end.getTime() - a.start.getTime());
        }
        return a.start.getTime() - b.start.getTime();
    });

    const columns: CalendarEvent[][] = [];

    // We don't really need processedEvents array if we just build columns then map
    // But keeping original logic structure for safety

    sorted.forEach(ev => {
        let placed = false;
        // Try to place in existing column
        for (let i = 0; i < columns.length; i++) {
            const lastInCol = columns[i][columns[i].length - 1];
            // If current event starts after last event in column ends -> fits here
            if (ev.start >= lastInCol.end) {
                columns[i].push(ev);
                placed = true;
                break;
            }
        }

        // If not placed, start new column
        if (!placed) {
            columns.push([ev]);
        }
    });

    const totalLanes = columns.length;

    // Re-map to apply correct width/left based on the lane index found
    const result = [];
    for (const ev of sorted) {
        // find which lane this event is in
        const laneIndex = columns.findIndex(col => col.includes(ev));
        const style = {
            top: `${(getHours(ev.start) * 60 + getMinutes(ev.start)) / 60 * HOUR_HEIGHT}px`,
            height: `${Math.max(differenceInMinutes(ev.end, ev.start) / 60 * HOUR_HEIGHT, 25)}px`,
            left: `${(laneIndex / totalLanes) * 100}%`,
            width: `${(1 / totalLanes) * 100}%`,
            position: 'absolute' as 'absolute'
        };
        result.push({ ...ev, style });
    }

    return result;
};


const WeekView: React.FC = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [now, setNow] = useState(new Date());
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    const { events, loading } = useGoogleEvents({
        timeMin: weekStart.toISOString(),
        timeMax: addDays(weekStart, 7).toISOString(),
        scope: 'weekView'
    });

    // Initial scroll
    useEffect(() => {
        if (scrollContainerRef.current) {
            const now = new Date();
            const startMinutes = getHours(now) * 60 + getMinutes(now);
            const scrollPos = (startMinutes / 60) * HOUR_HEIGHT - 300;
            scrollContainerRef.current.scrollTop = Math.max(0, scrollPos);
        }
    }, []); // Run once on mount (or when ref is ready? Ref shouldn't trigger re-render, so empty dep is fine)

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    const addWeek = () => setCurrentDate(d => addWeeks(d, 1));
    const subWeek = () => setCurrentDate(d => subWeeks(d, 1));
    const goToToday = () => setCurrentDate(new Date());

    const getCurrentTimePosition = () => {
        const minutes = getHours(now) * 60 + getMinutes(now);
        return (minutes / 60) * HOUR_HEIGHT;
    };

    return (
        <div className="h-full flex flex-col bg-slate-900/50 text-slate-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-900/80 backdrop-blur">
                <div className="flex items-center space-x-4">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                        {format(weekStart, 'MMMM yyyy', { locale: de })}
                    </h2>
                    <div className="flex bg-slate-800 rounded-lg p-1 border border-slate-700">
                        <button onClick={subWeek} className="p-1 hover:bg-slate-700 rounded transition-colors">
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <button onClick={goToToday} className="px-3 text-sm font-medium hover:bg-slate-700 rounded transition-colors mx-1">
                            Heute
                        </button>
                        <button onClick={addWeek} className="p-1 hover:bg-slate-700 rounded transition-colors">
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                    {loading && <span className="text-sm text-slate-500 animate-pulse">Lade...</span>}
                </div>
                <div className="flex items-center space-x-2 text-sm text-slate-400">
                    <CalendarIcon className="w-4 h-4" />
                    <span>KW {format(weekStart, 'w', { locale: de })}</span>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Day Headers */}
                <div className="grid grid-cols-[60px_1fr] border-b border-slate-700 bg-slate-900/80 shrink-0">
                    <div className="border-r border-slate-700"></div> {/* Time column header placeholder */}
                    <div className="grid grid-cols-7 divide-x divide-slate-700">
                        {weekDays.map(day => (
                            <div
                                key={day.toString()}
                                className={clsx(
                                    "p-2 text-center",
                                    isToday(day) ? "bg-blue-900/20" : ""
                                )}
                            >
                                <div className={clsx(
                                    "text-xs font-medium uppercase mb-1",
                                    isToday(day) ? "text-blue-400" : "text-slate-500"
                                )}>
                                    {format(day, 'EEE', { locale: de })}
                                </div>
                                <div className={clsx(
                                    "text-xl font-bold inline-flex items-center justify-center w-8 h-8 rounded-full",
                                    isToday(day) ? "bg-blue-500 text-white shadow-lg shadow-blue-500/50" : "text-slate-300"
                                )}>
                                    {format(day, 'd')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Scrollable Body */}
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden relative custom-scrollbar">
                    <div className="grid grid-cols-[60px_1fr] min-h-[1440px]"> {/* 24 * 60px */}

                        {/* Time Column */}
                        <div className="border-r border-slate-700 bg-slate-900/30">
                            {Array.from({ length: 24 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="relative border-b border-transparent text-xs text-slate-500 text-right pr-2 pt-1"
                                    style={{ height: `${HOUR_HEIGHT}px` }}
                                >
                                    <span className="-translate-y-1/2 block">{i}:00</span>
                                </div>
                            ))}
                        </div>

                        {/* Events Grid */}
                        <div className="grid grid-cols-7 relative divide-x divide-slate-700/50 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwJSIgaGVpZ2h0PSI2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMCA2MEwxMDAwMCA2MCIgc3Ryb2tlPSJyZ2JhKDc1LDg1LDEwMSwwLjEpIiBmaWxsPSJub25lIi8+PC9zdmc+')]" style={{ backgroundSize: `100% ${HOUR_HEIGHT}px` }}>
                            {weekDays.map((day) => {
                                // Filter events for this day
                                const dayEventsRaw = events.filter(e => isSameDay(e.start, day));
                                // Calculate layout (avoid overlaps)
                                const layoutedEvents = layoutEvents(dayEventsRaw);

                                const isCurrentDay = isToday(day);

                                return (
                                    <div key={day.toString()} className={clsx("relative", isCurrentDay && "bg-blue-900/5")}>

                                        {/* Current Time Line */}
                                        {isCurrentDay && (
                                            <div
                                                className="absolute w-full border-t-2 border-red-500 z-20 pointer-events-none"
                                                style={{ top: `${getCurrentTimePosition()}px` }}
                                            >
                                                <div className="absolute -left-1 -top-1.5 w-3 h-3 bg-red-500 rounded-full" />
                                            </div>
                                        )}

                                        {/* Events */}
                                        {layoutedEvents.map(event => (
                                            <div
                                                key={event.id}
                                                className={clsx(
                                                    "rounded-md p-1 pl-2 text-xs border shadow-sm overflow-hidden hover:z-50 hover:shadow-xl transition-all cursor-pointer group flex flex-col",
                                                )}
                                                style={{
                                                    ...event.style,
                                                    backgroundColor: event.color || '#3b82f6',
                                                    borderColor: event.color || '#3b82f6'
                                                }}
                                            >
                                                <div className="font-bold text-white drop-shadow-md whitespace-normal break-words leading-tight">
                                                    {event.title}
                                                </div>
                                                <div className="text-white/90 truncate text-[10px] mt-0.5">
                                                    {format(event.start, 'HH:mm')} - {format(event.end, 'HH:mm')}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WeekView;
