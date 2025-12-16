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
import { mockEvents, CalendarEvent } from '../../services/mockData';
import clsx from 'clsx';

// Constants for layout
const HOUR_HEIGHT = 60; // pixels per hour
const START_HOUR = 6;   // Start scroll at 6:00


const CalendarView: React.FC = () => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [now, setNow] = useState(new Date());
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Initial scroll to current time
    useEffect(() => {
        if (scrollContainerRef.current) {
            const now = new Date();
            const startMinutes = getHours(now) * 60 + getMinutes(now);
            const scrollPos = (startMinutes / 60) * HOUR_HEIGHT - 300; // Center (approx half screen height)
            scrollContainerRef.current.scrollTop = Math.max(0, scrollPos);
        }
    }, [scrollContainerRef]);

    // Update "now" every minute
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') subWeek();
            if (e.key === 'ArrowRight') addWeek();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentDate]);

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
    const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

    const addWeek = () => setCurrentDate(d => addWeeks(d, 1));
    const subWeek = () => setCurrentDate(d => subWeeks(d, 1));
    const goToToday = () => setCurrentDate(new Date());

    // Filter events for the current week
    const weekEvents = mockEvents.filter(event => {
        const eventDate = event.start;
        return eventDate >= weekStart && eventDate < addDays(weekStart, 7);
    });

    const getEventStyle = (event: CalendarEvent) => {
        const startMinutes = getHours(event.start) * 60 + getMinutes(event.start);
        const duration = differenceInMinutes(event.end, event.start);

        return {
            top: `${(startMinutes / 60) * HOUR_HEIGHT}px`,
            height: `${(duration / 60) * HOUR_HEIGHT}px`,
        };
    };

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
                                const dayEvents = weekEvents.filter(e => isSameDay(e.start, day));
                                const isCurrentDay = isToday(day);

                                return (
                                    <div key={day.toString()} className={clsx("relative", isCurrentDay && "bg-blue-900/5")}>

                                        {/* Current Time Line */}
                                        {isCurrentDay && (
                                            <div
                                                className="absolute w-full border-t-2 border-black z-20 pointer-events-none"
                                                style={{ top: `${getCurrentTimePosition()}px` }}
                                            >
                                                <div className="absolute -left-1 -top-1.5 w-3 h-3 bg-black rounded-full" />
                                            </div>
                                        )}

                                        {/* Events */}
                                        {dayEvents.map(event => (
                                            <div
                                                key={event.id}
                                                className={clsx(
                                                    "absolute left-1 right-1 rounded-md p-2 text-xs border border-white/10 shadow-sm overflow-hidden hover:z-10 hover:shadow-md transition-shadow cursor-pointer",
                                                    event.color || "bg-blue-600"
                                                )}
                                                style={getEventStyle(event)}
                                            >
                                                <div className="font-bold truncate text-white shadow-sm">{event.title}</div>
                                                <div className="text-white/80 truncate">
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

export default CalendarView;
