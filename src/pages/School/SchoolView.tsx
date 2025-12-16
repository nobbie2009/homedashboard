import React, { useEffect, useState } from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { BookOpen, Clock, AlertCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface Lesson {
    id: string;
    subject: { name: string; short: string };
    class: { name: string };
    teacher: { name: string };
    classroom: { name: string };
    startTime: string;
    endTime: string;
    date: string;
}

interface StudentData {
    name: string;
    timetable: Lesson[];
    homework: any[];
}

const SchoolView: React.FC = () => {
    const { config } = useConfig();
    const [data, setData] = useState<StudentData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        if (!config.edupage?.username || !config.edupage?.password) {
            setError("Keine Edupage Zugangsdaten in den Einstellungen hinterlegt.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/edupage', {
                headers: {
                    'username': config.edupage.username,
                    'password': config.edupage.password
                }
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Fehler beim Laden der Daten');
            }

            const result = await response.json();
            // Expecting { students: [...] }
            if (result.students) {
                setData(result.students);
            } else {
                // Fallback if backend returns flat structure
                setData([{ name: result.user?.name || 'Schüler', timetable: result.timetable || [], homework: [] }]);
            }

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // Auto-refresh every 30 minutes
        const interval = setInterval(fetchData, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [config.edupage]); // Reload if config changes

    if (error) {
        return (
            <div className="h-full flex items-center justify-center p-8 text-center bg-slate-900 text-white">
                <div className="max-w-md bg-slate-800 p-6 rounded-xl border border-red-500/50">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <h3 className="text-xl font-bold mb-2">Verbindungsfehler</h3>
                    <p className="text-slate-300 mb-4">{error}</p>
                    <button onClick={fetchData} className="bg-blue-600 px-4 py-2 rounded-lg hover:bg-blue-500">
                        Erneut versuchen
                    </button>
                </div>
            </div>
        );
    }

    if (loading && data.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center bg-slate-900 text-white space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                <p className="text-slate-400">Lade Schuldaten...</p>
            </div>
        );
    }

    // Determine grid columns based on student count (max 2 for now as requested)
    const gridCols = data.length > 1 ? 'grid-cols-2' : 'grid-cols-1';

    return (
        <div className="h-full bg-slate-900 p-6 text-slate-100 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
                    Schule
                </h2>
                <button onClick={fetchData} className="p-2 hover:bg-slate-800 rounded-full transition" disabled={loading}>
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className={`grid ${gridCols} gap-6 h-full pb-20`}>
                {data.map((student, idx) => (
                    <div key={idx} className="flex flex-col space-y-6">
                        {/* Student Header */}
                        <div className="flex items-center space-x-3 bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-xl font-bold">
                                {student.name.charAt(0)}
                            </div>
                            <h3 className="text-xl font-bold">{student.name}</h3>
                        </div>

                        {/* Timetable Section */}
                        <div className="bg-slate-800/80 rounded-xl border border-slate-700 overflow-hidden flex-1 flex flex-col">
                            <div className="p-4 border-b border-slate-700 bg-slate-800 flex items-center justify-between">
                                <h4 className="font-bold flex items-center">
                                    <Clock className="w-4 h-4 mr-2 text-blue-400" />
                                    Stundenplan
                                </h4>
                            </div>
                            <div className="p-2 space-y-2 overflow-y-auto max-h-[500px] flex-1">
                                {student.timetable && student.timetable.length > 0 ? (
                                    (() => {
                                        const groupedLessons: React.ReactNode[] = [];
                                        let lastDate = '';

                                        student.timetable.forEach((lesson, lIdx) => {
                                            // Format date for comparison and display header
                                            // lesson.date is likely ISO string "2023-12-16T..."
                                            const lessonDateObj = new Date(lesson.date);
                                            const dateStr = format(lessonDateObj, 'yyyy-MM-dd');

                                            // Insert Header if date changed
                                            if (dateStr !== lastDate) {
                                                const isToday = format(new Date(), 'yyyy-MM-dd') === dateStr;
                                                const displayDate = format(lessonDateObj, 'EEEE, dd.MM.', { locale: de });

                                                groupedLessons.push(
                                                    <div key={`header-${dateStr}`} className="sticky top-0 z-10 bg-slate-800/95 backdrop-blur py-2 px-1 border-b border-slate-700/50 text-xs font-bold text-slate-400 uppercase tracking-wider mt-2 first:mt-0">
                                                        {isToday ? `Heute - ${displayDate}` : displayDate}
                                                    </div>
                                                );
                                                lastDate = dateStr;
                                            }

                                            groupedLessons.push(
                                                <div key={lesson.id || `${lIdx}-${lesson.startTime}`} className="bg-slate-700/50 p-3 rounded-lg flex justify-between items-center hover:bg-slate-700 transition">
                                                    <div className="flex items-center space-x-3 w-full">
                                                        <div className="text-sm font-mono text-slate-400 w-12 text-right flex-shrink-0">
                                                            {lesson.startTime}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="font-bold text-emerald-300 truncate">{lesson.subject?.name || 'Unbekannt'}</div>
                                                            <div className="text-xs text-slate-400 truncate">
                                                                Raum {lesson.classroom?.name} • {lesson.teacher?.name}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        });
                                        return groupedLessons;
                                    })()
                                ) : (
                                    <div className="text-center p-4 text-slate-500 italic">Keine Stunden gefunden</div>
                                )}
                            </div>
                        </div>

                        {/* Homework Section */}
                        <div className="bg-slate-800/80 rounded-xl border border-slate-700 overflow-hidden flex-1">
                            <div className="p-4 border-b border-slate-700 bg-slate-800">
                                <h4 className="font-bold flex items-center">
                                    <BookOpen className="w-4 h-4 mr-2 text-orange-400" />
                                    Hausaufgaben & Prüfungen
                                </h4>
                            </div>
                            <div className="p-4 text-center text-slate-500 italic">
                                {student.homework?.length === 0 ? "Alles erledigt!" : "Aufgaben anzeigen..."}
                            </div>
                        </div>
                    </div>
                ))}

                {data.length === 0 && !loading && (
                    <div className="col-span-full text-center p-10 bg-slate-800/30 rounded-xl border border-dashed border-slate-700">
                        <p className="text-slate-400">Keine Schülerdaten gefunden.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SchoolView;
