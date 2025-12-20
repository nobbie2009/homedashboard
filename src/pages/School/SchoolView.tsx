import React from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { useEdupage } from '../../hooks/useEdupage';
import { GraduationCap, BookOpen, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export const SchoolView: React.FC = () => {
    const { config } = useConfig();
    const { students, loading, error } = useEdupage();

    const hasCredentials = config.edupage?.username && config.edupage?.password;

    if (!hasCredentials) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                <GraduationCap className="w-16 h-16 opacity-50" />
                <h2 className="text-2xl font-semibold">Edupage nicht konfiguriert</h2>
                <p>Bitte hinterlege Benutzername und Passwort in den Admin-Einstellungen.</p>
            </div>
        );
    }

    if (loading && students.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4 animate-pulse">
                <GraduationCap className="w-16 h-16 opacity-50" />
                <h2 className="text-xl">Lade Schuldaten...</h2>
            </div>
        );
    }

    if (error && students.length === 0) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-red-400 space-y-4">
                <AlertCircle className="w-16 h-16 opacity-50" />
                <h2 className="text-xl font-semibold">Fehler beim Laden</h2>
                <p>{error}</p>
            </div>
        );
    }

    return (
        <div className="h-full w-full p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            {students.map((student, idx) => (
                <div key={idx} className="bg-slate-800/50 rounded-xl border border-slate-700 flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="p-4 border-b border-slate-700 bg-slate-800/80 flex items-center space-x-3">
                        <div className="bg-blue-600/20 p-2 rounded-full text-blue-400">
                            <GraduationCap className="w-6 h-6" />
                        </div>
                        <h2 className="text-xl font-bold text-white">{student.name}</h2>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                        {/* Timetable */}
                        <section>
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center">
                                <Clock className="w-4 h-4 mr-2" />
                                Stundenplan (Demnächst)
                            </h3>
                            <div className="space-y-2">
                                {student.timetable.length === 0 ? (
                                    <p className="text-slate-500 text-sm italic">Keine Stunden heute/morgen.</p>
                                ) : (
                                    student.timetable.map((lesson) => (
                                        <div key={lesson.id} className="flex items-center bg-slate-900/40 p-2 rounded border border-slate-700/50">
                                            <div className="w-16 text-center border-r border-slate-700 pr-2 mr-3">
                                                <div className="text-white font-bold">{lesson.startTime}</div>
                                                <div className="text-xs text-slate-500">{lesson.endTime}</div>
                                            </div>
                                            <div className="flex-1">
                                                <div className="font-semibold text-blue-300">{lesson.subject.name}</div>
                                                <div className="text-xs text-slate-400 flex justify-between">
                                                    <span>{lesson.classroom?.name}</span>
                                                    <span>{lesson.teacher?.name}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>

                        {/* Homework */}
                        <section>
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center">
                                <BookOpen className="w-4 h-4 mr-2" />
                                Hausaufgaben
                            </h3>
                            <div className="space-y-2">
                                {student.homework.length === 0 ? (
                                    <p className="text-slate-500 text-sm italic">Keine Hausaufgaben.</p>
                                ) : (
                                    student.homework.map((hw) => (
                                        <div key={hw.id} className="bg-slate-900/40 p-3 rounded border border-slate-700/50 flex flex-col group hover:border-slate-600 transition">
                                            <div className="flex justify-between items-start mb-1">
                                                <span className="font-semibold text-yellow-500/90">{hw.subject}</span>
                                                <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                                                    {hw.date ? format(new Date(hw.date), 'dd.MM', { locale: de }) : 'Kein Datum'}
                                                </span>
                                            </div>
                                            <div className="text-sm text-slate-300 line-clamp-2">{hw.title}</div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            ))}

            {students.length === 0 && !loading && !error && (
                <div className="col-span-2 flex flex-col items-center justify-center text-slate-500">
                    <p>Keine Schüler gefunden.</p>
                    <p className="text-sm">Prüfe die Edupage-Einstellungen und IDs.</p>
                </div>
            )}
        </div>
    );
};
