import React, { useMemo, useState } from 'react';
import { format, startOfWeek, addDays, addWeeks, isToday, differenceInCalendarWeeks } from 'date-fns';
import { de } from 'date-fns/locale';
import { GraduationCap, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { useGoogleEvents, occursOnDay, CalendarEvent } from '../../hooks/useGoogleEvents';

const SCHOOL_DAYS = 5; // Mo–Fr

/**
 * Farbe nach Fach statt nach Kalender: alle Stunden eines Kindes kämen sonst
 * in derselben Kalenderfarbe und der Plan wäre eine einzige Fläche.
 */
const getSubjectColor = (title: string): string => {
    const name = title.toLowerCase();

    if (name.includes('deutsch')) return 'bg-purple-500/80 border-purple-400/50';
    if (name.includes('mathe')) return 'bg-blue-500/80 border-blue-400/50';
    if (name.includes('englisch')) return 'bg-indigo-500/80 border-indigo-400/50';
    if (name.includes('heimat') || name.includes('sachkunde') || name.includes('hsk')) return 'bg-green-600/80 border-green-500/50';
    if (name.includes('sport') || name.includes('schwimm')) return 'bg-lime-600/80 border-lime-500/50';
    if (name.includes('musik')) return 'bg-orange-500/80 border-orange-400/50';
    if (name.includes('kunst') || name.includes('werken')) return 'bg-pink-500/80 border-pink-400/50';
    if (name.includes('religion') || name.includes('ethik')) return 'bg-amber-500/80 border-amber-400/50';
    if (name.includes('ergänz') || name.includes('förder')) return 'bg-cyan-600/80 border-cyan-500/50';
    if (name.includes('garten') || name.includes('natur')) return 'bg-teal-600/80 border-teal-500/50';
    return 'bg-slate-500/80 border-slate-400/50';
};

interface Student {
    calendarId: string;
    name: string;
    color: string;
}

/**
 * Stundenplan eines Kindes als Raster: Zeilen sind die im Kalender
 * vorkommenden Zeitfenster, Spalten die Wochentage. Termine ohne Uhrzeit
 * (Ferien, Wandertag) stehen in einem eigenen Band darüber.
 */
const TimetableGrid: React.FC<{
    days: Date[];
    lessons: CalendarEvent[];
    /** Band auch ohne eigene Einträge rendern, damit beide Raster bündig starten. */
    reserveAllDayBand: boolean;
}> = ({ days, lessons, reserveAllDayBand }) => {
    const { slots, lessonMap, allDay } = useMemo(() => {
        const allDay: CalendarEvent[] = [];
        const slotSet = new Set<string>();
        const lessonMap = new Map<string, CalendarEvent>();

        for (const lesson of lessons) {
            if (lesson.allDay) {
                allDay.push(lesson);
                continue;
            }
            const slot = `${format(lesson.start, 'HH:mm')}-${format(lesson.end, 'HH:mm')}`;
            slotSet.add(slot);
            // Mehrere Stunden im selben Fenster am selben Tag sind im
            // Stundenplan nicht vorgesehen — die erste gewinnt.
            const key = `${format(lesson.start, 'yyyy-MM-dd')}_${slot}`;
            if (!lessonMap.has(key)) lessonMap.set(key, lesson);
        }

        const slots = Array.from(slotSet).sort((a, b) => a.localeCompare(b));
        return { slots, lessonMap, allDay };
    }, [lessons]);

    if (slots.length === 0 && allDay.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400 dark:text-slate-500">
                <GraduationCap className="w-8 h-8 opacity-30 mb-2" />
                <p className="italic">Keine Stunden in dieser Woche.</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {(allDay.length > 0 || reserveAllDayBand) && (
                <div className="flex flex-wrap items-center gap-2 min-h-[26px]">
                    {allDay.map(event => (
                        <span
                            key={event.id}
                            className="px-2 py-1 rounded text-xs font-semibold text-white shadow-sm"
                            style={{ backgroundColor: event.color || '#3b82f6' }}
                        >
                            {event.title}
                        </span>
                    ))}
                </div>
            )}

            {slots.length > 0 && (
                <table className="w-full border-collapse table-fixed">
                    <thead>
                        <tr>
                            <th className="w-14" />
                            {days.map(day => (
                                <th key={day.toISOString()} className="p-1 pb-2 text-center">
                                    <div className={`text-sm font-bold ${isToday(day) ? 'text-blue-500 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                        {format(day, 'EEEEEE', { locale: de })}
                                    </div>
                                    <div className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                                        {format(day, 'dd.MM.')}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {slots.map((slot, idx) => {
                            const [start, end] = slot.split('-');
                            return (
                                <tr key={slot}>
                                    <td className="pr-2 text-right align-top">
                                        <div className="text-xs font-bold text-slate-600 dark:text-slate-300">{idx + 1}.</div>
                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums leading-tight">{start}</div>
                                        <div className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums leading-tight opacity-70">{end}</div>
                                    </td>
                                    {days.map(day => {
                                        const lesson = lessonMap.get(`${format(day, 'yyyy-MM-dd')}_${slot}`);
                                        return (
                                            <td key={day.toISOString()} className="p-0.5 align-top">
                                                {lesson ? (
                                                    <div
                                                        className={`rounded border p-1.5 min-h-[48px] text-white ${getSubjectColor(lesson.title)} ${isToday(day) ? '' : 'opacity-90'}`}
                                                        title={lesson.title}
                                                    >
                                                        <div className="text-sm font-bold leading-tight break-words">{lesson.title}</div>
                                                        {lesson.location && (
                                                            <div className="text-[10px] opacity-80 truncate mt-0.5">{lesson.location}</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="min-h-[48px]" />
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
};

export const SchoolView: React.FC = () => {
    const { config } = useConfig();

    // Am Wochenende ist die laufende Schulwoche vorbei — dann gleich die
    // kommende zeigen, sonst hängt am Sonntag ein abgelaufener Plan an der Wand.
    const defaultOffset = useMemo(() => {
        const weekday = new Date().getDay(); // 0 = Sonntag, 6 = Samstag
        return weekday === 0 || weekday === 6 ? 1 : 0;
    }, []);
    const [weekOffset, setWeekOffset] = useState(defaultOffset);

    const weekStart = useMemo(
        () => startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 }),
        [weekOffset]
    );
    const days = useMemo(
        () => Array.from({ length: SCHOOL_DAYS }, (_, i) => addDays(weekStart, i)),
        [weekStart]
    );

    // Nur ausdrücklich als Stundenplan markierte Kalender — sonst stünde hier
    // jeder aktive Familienkalender.
    const students: Student[] = useMemo(() => {
        const settings = config.google?.calendarSettings || {};
        const selected = config.google?.selectedCalendars || [];
        return selected
            .map(id => settings[id])
            .filter((s): s is NonNullable<typeof s> => !!s && s.scopes?.school === true)
            .map(s => ({ calendarId: s.id, name: s.alias || s.id, color: s.color || '#3b82f6' }));
    }, [config.google?.calendarSettings, config.google?.selectedCalendars]);

    const { events, loading, error, refresh } = useGoogleEvents({
        timeMin: weekStart.toISOString(),
        timeMax: addDays(weekStart, 7).toISOString(),
        enabled: students.length > 0,
    });

    const weekLabel = useMemo(() => {
        const diff = differenceInCalendarWeeks(weekStart, new Date(), { weekStartsOn: 1 });
        if (diff === 0) return 'Diese Woche';
        if (diff === 1) return 'Nächste Woche';
        if (diff === -1) return 'Letzte Woche';
        return `Woche vom ${format(weekStart, 'dd.MM.yyyy', { locale: de })}`;
    }, [weekStart]);

    const lessonsByStudent = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        for (const student of students) {
            map.set(
                student.calendarId,
                events.filter(e => e.calendarId === student.calendarId && days.some(d => occursOnDay(e, d)))
            );
        }
        return map;
    }, [events, students, days]);

    // Hat ein Kind einen ganztägigen Eintrag, halten alle Karten Platz dafür
    // frei — sonst rutschen die Raster gegeneinander.
    const anyAllDay = useMemo(
        () => Array.from(lessonsByStudent.values()).some(list => list.some(e => e.allDay)),
        [lessonsByStudent]
    );

    if (students.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-3 px-8 text-center">
                <GraduationCap className="w-16 h-16 opacity-40" />
                <h2 className="text-2xl font-semibold">Kein Stundenplan-Kalender ausgewählt</h2>
                <p className="max-w-xl">
                    Im Admin unter <span className="font-semibold">Kalender</span> bei den gewünschten Kalendern
                    (z.&nbsp;B. „Schule Charlotte" und „Schule Johanna") den Schalter
                    <span className="font-bold text-blue-500 dark:text-blue-400"> S </span>
                    aktivieren.
                </p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col gap-4">
            {/* Wochennavigation */}
            <div className="widget-card flex items-center justify-between bg-slate-200/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-300 dark:border-slate-700 flex-none">
                <button
                    onClick={() => setWeekOffset(o => o - 1)}
                    className="p-2 px-4 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-2"
                >
                    <ChevronLeft className="w-5 h-5" />
                    <span>Woche</span>
                </button>

                <button
                    onClick={() => setWeekOffset(defaultOffset)}
                    className="text-slate-700 dark:text-slate-200 font-medium hover:text-slate-900 dark:hover:text-white transition-colors"
                >
                    {weekLabel}
                    <span className="text-slate-400 dark:text-slate-500 ml-2">KW {format(weekStart, 'w', { locale: de })}</span>
                </button>

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setWeekOffset(o => o + 1)}
                        className="p-2 px-4 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-2"
                    >
                        <span>Woche</span>
                        <ChevronRight className="w-5 h-5" />
                    </button>
                    <div className="w-px h-6 bg-slate-300 dark:bg-slate-700 mx-1" />
                    <button
                        onClick={refresh}
                        title="Termine neu laden"
                        className="p-2 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300 hover:text-blue-400 transition-colors"
                    >
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {error === 'AUTH_REQUIRED' ? (
                <div className="flex-1 flex flex-col items-center justify-center text-amber-400 space-y-2">
                    <span className="font-bold text-lg">Google Login abgelaufen</span>
                    <span className="text-sm text-slate-600 dark:text-slate-300">Bitte im Admin-Menü neu verbinden.</span>
                </div>
            ) : error ? (
                <div className="flex-1 flex flex-col items-center justify-center text-red-400 space-y-2">
                    <span className="font-bold">Fehler beim Laden</span>
                    <span className="text-sm">{error}</span>
                </div>
            ) : (
                <div
                    className="flex-1 grid gap-4 overflow-hidden"
                    style={{ gridTemplateColumns: `repeat(${Math.min(students.length, 2)}, minmax(0, 1fr))` }}
                >
                    {students.map(student => (
                        <div
                            key={student.calendarId}
                            className="widget-card bg-slate-200/50 dark:bg-slate-800/50 rounded-xl border border-slate-300 dark:border-slate-700 flex flex-col overflow-hidden shadow-lg backdrop-blur-sm"
                        >
                            <div className="p-3 border-b border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 flex items-center gap-3 flex-none">
                                <div
                                    className="p-2 rounded-full text-white"
                                    style={{ backgroundColor: student.color }}
                                >
                                    <GraduationCap className="w-5 h-5" />
                                </div>
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-wide">{student.name}</h2>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                                {loading && events.length === 0 ? (
                                    <div className="flex items-center justify-center h-40 text-slate-400 dark:text-slate-500 animate-pulse">
                                        Lade Stundenplan...
                                    </div>
                                ) : (
                                    <TimetableGrid
                                        days={days}
                                        lessons={lessonsByStudent.get(student.calendarId) || []}
                                        reserveAllDayBand={anyAllDay}
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SchoolView;
