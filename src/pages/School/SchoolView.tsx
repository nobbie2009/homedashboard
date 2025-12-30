import React, { useState } from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { useEdupage } from '../../hooks/useEdupage';
import { GraduationCap, BookOpen, Clock, AlertCircle, MessageSquare, Trophy, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export const SchoolView: React.FC = () => {
    const { config } = useConfig();
    // State to track active tab for each student index
    // Default to 'timetable'
    const [currentDate, setCurrentDate] = useState(new Date());
    const { students, loading, error, refresh } = useEdupage(currentDate);

    // State to track active tab for each student index
    // Default to 'timetable'
    const [activeTabs, setActiveTabs] = useState<Record<number, string>>({});

    const getActiveTab = (idx: number) => activeTabs[idx] || 'timetable';
    const setActiveTab = (idx: number, tab: string) => setActiveTabs(prev => ({ ...prev, [idx]: tab }));

    const hasCredentials = config.edupage?.username && config.edupage?.password;

    // Week Navigation Handlers
    const handlePrevWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() - 7);
        setCurrentDate(newDate);
    };

    const handleNextWeek = () => {
        const newDate = new Date(currentDate);
        newDate.setDate(newDate.getDate() + 7);
        setCurrentDate(newDate);
    };

    const handleResetWeek = () => {
        setCurrentDate(new Date());
    };

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
        <div className="h-full w-full p-4 flex flex-col gap-4">
            {/* Global Week Navigation (Applying to all students for simplicity) */}
            <div className="flex items-center justify-between bg-slate-800/50 p-2 rounded-lg border border-slate-700">
                <button onClick={handlePrevWeek} className="p-2 hover:bg-slate-700 rounded text-slate-300 transition-colors flex items-center gap-2">
                    <Clock className="w-5 h-5 rotate-180" />
                    <span className="hidden sm:inline">&lt; Woche</span>
                </button>

                <div className="text-slate-200 font-medium cursor-pointer hover:text-white transition-colors" onClick={handleResetWeek}>
                    <span className="hidden sm:inline">Woche vom </span>
                    {format(currentDate, 'dd.MM.yyyy', { locale: de })}
                </div>

                <div className="flex items-center gap-1">
                    <button onClick={handleNextWeek} className="p-2 hover:bg-slate-700 rounded text-slate-300 transition-colors flex items-center gap-2">
                        <span className="hidden sm:inline">Woche &gt;</span>
                        <Clock className="w-5 h-5" />
                    </button>
                    <div className="w-px h-6 bg-slate-700 mx-1"></div>
                    <button onClick={refresh} title="Daten aktualisieren" className="p-2 hover:bg-slate-700 rounded text-slate-300 hover:text-blue-400 transition-colors">
                        <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden">
                {students.map((student, idx) => {
                    const currentTab = getActiveTab(idx);

                    return (
                        <div key={idx} className="bg-slate-800/50 rounded-xl border border-slate-700 flex flex-col overflow-hidden shadow-lg backdrop-blur-sm h-full">
                            {/* Header */}
                            <div className="p-4 border-b border-slate-700 bg-slate-900/60 flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="bg-blue-600/20 p-2 rounded-full text-blue-400 border border-blue-500/30">
                                        <GraduationCap className="w-6 h-6" />
                                    </div>
                                    <h2 className="text-xl font-bold text-white tracking-wide">{student.name}</h2>
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="flex bg-slate-900/40 p-1 border-b border-slate-800">
                                {[
                                    { id: 'timetable', label: 'Plan', icon: Clock },
                                    { id: 'homework', label: 'Hausaufgaben', icon: BookOpen },
                                    { id: 'grades', label: 'Noten', icon: Trophy },
                                    { id: 'messages', label: 'Infos', icon: MessageSquare },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(idx, tab.id)}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-all ${currentTab === tab.id
                                            ? 'bg-slate-700 text-white shadow-sm'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                                            }`}
                                    >
                                        <tab.icon className="w-4 h-4" />
                                        <span className="hidden sm:inline">{tab.label}</span>
                                    </button>
                                ))}
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-800/20">

                                {/* TIMETABLE */}
                                {currentTab === 'timetable' && (
                                    <div className="space-y-4">
                                        {/* Group by Day */}
                                        {(() => {
                                            // Subject color mapping - similar to Edupage
                                            const getSubjectColor = (subjectName: string, subjectShort: string): string => {
                                                const name = subjectName.toLowerCase();
                                                const short = subjectShort.toLowerCase();

                                                // Deutsch = Red/Purple (like Edupage)
                                                if (name.includes('deutsch') || short === 'de') {
                                                    return 'bg-purple-600/60 border-purple-400/50 text-purple-100';
                                                }
                                                // Mathematik = Blue
                                                if (name.includes('mathe') || short === 'ma') {
                                                    return 'bg-blue-600/60 border-blue-400/50 text-blue-100';
                                                }
                                                // Heimat- und Sachkunde = Green
                                                if (name.includes('heimat') || name.includes('sachkunde') || short === 'hsk' || short === 'hus') {
                                                    return 'bg-green-600/60 border-green-400/50 text-green-100';
                                                }
                                                // Sport = Light Green
                                                if (name.includes('sport') || short === 'sp') {
                                                    return 'bg-lime-600/60 border-lime-400/50 text-lime-100';
                                                }
                                                // Musik = Orange/Peach
                                                if (name.includes('musik') || short === 'mu') {
                                                    return 'bg-orange-500/60 border-orange-400/50 text-orange-100';
                                                }
                                                // Kunst/Werken = Pink
                                                if (name.includes('kunst') || name.includes('werken') || short === 'ku' || short === 'wk') {
                                                    return 'bg-pink-600/60 border-pink-400/50 text-pink-100';
                                                }
                                                // Religion/Ethik = Amber
                                                if (name.includes('religion') || name.includes('ethik') || short === 'rel' || short === 'eth') {
                                                    return 'bg-amber-600/60 border-amber-400/50 text-amber-100';
                                                }
                                                // Ergänzung = Cyan
                                                if (name.includes('ergänz') || short === 'erg') {
                                                    return 'bg-cyan-600/60 border-cyan-400/50 text-cyan-100';
                                                }
                                                // Schulgarten = Teal
                                                if (name.includes('garten') || short === 'sg') {
                                                    return 'bg-teal-600/60 border-teal-400/50 text-teal-100';
                                                }
                                                // Default = Slate
                                                return 'bg-slate-600/60 border-slate-400/50 text-slate-100';
                                            };

                                            if (student.timetable.length === 0) {
                                                return (
                                                    <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                                                        <Clock className="w-8 h-8 opacity-20 mb-2" />
                                                        <p className="italic">Keine Stunden für diese Woche.</p>
                                                    </div>
                                                );
                                            }

                                            // Group lessons by date
                                            const groupedLessons: Record<string, typeof student.timetable> = {};
                                            student.timetable.forEach(lesson => {
                                                const dateKey = lesson.date.split('T')[0];
                                                if (!groupedLessons[dateKey]) groupedLessons[dateKey] = [];
                                                groupedLessons[dateKey].push(lesson);
                                            });

                                            // Sort dates
                                            const sortedDates = Object.keys(groupedLessons).sort();

                                            return sortedDates.map(dateKey => (
                                                <div key={dateKey} className="space-y-2">
                                                    <h3 className="text-slate-400 text-sm font-bold sticky top-0 bg-slate-900/80 p-1 backdrop-blur-md z-10">
                                                        {format(new Date(dateKey), 'EEEE, dd.MM.', { locale: de })}
                                                    </h3>
                                                    <div className="space-y-2 pl-2 border-l-2 border-slate-700/50">
                                                        {groupedLessons[dateKey].map((lesson) => {
                                                            const subjectColor = getSubjectColor(lesson.subject.name, lesson.subject.short);
                                                            return (
                                                                <div key={lesson.id} className={`flex items-center p-2 rounded-lg border transition ${subjectColor}`}>
                                                                    <div className="w-14 text-center border-r border-white/20 pr-2 mr-3 flex flex-col justify-center">
                                                                        <div className="font-bold text-sm leading-none">{lesson.startTime}</div>
                                                                        <div className="text-[10px] opacity-70 mt-1">{lesson.endTime}</div>
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <div className="font-bold text-sm mb-0.5">{lesson.subject.name}</div>
                                                                        <div className="text-[11px] opacity-80 flex justify-between items-center">
                                                                            <span className="bg-black/20 px-1.5 py-0.5 rounded">{lesson.classroom?.name}</span>
                                                                            <span className="italic">{lesson.teacher?.name}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                )}


                                {/* HOMEWORK */}
                                {currentTab === 'homework' && (
                                    <div className="space-y-3">
                                        {student.homework.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                                                <BookOpen className="w-8 h-8 opacity-20 mb-2" />
                                                <p className="italic">Keine Hausaufgaben offen.</p>
                                            </div>
                                        ) : (
                                            student.homework.map((hw) => (
                                                <div key={hw.id} className="bg-slate-700/40 p-3 rounded-lg border border-slate-600/30 flex flex-col group hover:border-slate-500/50 transition">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded text-sm">{hw.subject}</span>
                                                        <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded flex items-center">
                                                            <Clock className="w-3 h-3 mr-1 opacity-50" />
                                                            {hw.date ? format(new Date(hw.date), 'dd.MM', { locale: de }) : 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="text-sm text-slate-200 leading-relaxed font-medium">{hw.title}</div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {/* GRADES */}
                                {currentTab === 'grades' && (
                                    <div className="space-y-2">
                                        {(!student.grades || student.grades.length === 0) ? (
                                            <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                                                <Trophy className="w-8 h-8 opacity-20 mb-2" />
                                                <p className="italic">Keine Noten gefunden.</p>
                                            </div>
                                        ) : (
                                            student.grades.map((grade, gIdx) => (
                                                <div key={gIdx} className="flex items-center justify-between bg-slate-700/40 p-3 rounded-lg border border-slate-600/30 hover:bg-slate-700/60 transition">
                                                    <span className="text-slate-200 font-medium">{grade.subject}</span>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs text-slate-500">{grade.date ? format(new Date(grade.date), 'dd.MM') : ''}</span>
                                                        <span className="text-xl font-bold text-white bg-blue-600 w-10 h-10 flex items-center justify-center rounded-lg shadow-lg border border-blue-400/30">
                                                            {grade.value}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}

                                {/* MESSAGES */}
                                {currentTab === 'messages' && (
                                    <div className="space-y-4">
                                        {(!student.messages || student.messages.length === 0) ? (
                                            <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                                                <MessageSquare className="w-8 h-8 opacity-20 mb-2" />
                                                <p className="italic">Keine Nachrichten.</p>
                                            </div>
                                        ) : (
                                            student.messages.map((msg, mIdx) => (
                                                <div key={mIdx} className="bg-slate-700/40 p-4 rounded-lg border-l-4 border-blue-500 shadow-sm">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <h4 className="font-bold text-slate-200 text-sm">{msg.title}</h4>
                                                        <span className="text-[10px] text-slate-500 whitespace-nowrap ml-2">
                                                            {msg.date ? format(new Date(msg.date), 'dd.MM HH:mm') : ''}
                                                        </span>
                                                    </div>
                                                    <p className="text-slate-300 text-xs leading-relaxed opacity-90">{msg.body}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {students.length === 0 && !loading && !error && (
                    <div className="col-span-2 flex flex-col items-center justify-center text-slate-500 mt-20">
                        <p className="text-lg">Keine Schüler gefunden.</p>
                        <p className="text-sm opacity-60">Prüfe die Edupage-Einstellungen und IDs.</p>
                    </div>
                )}
            </div>
        </div>
    );
};


export default SchoolView;
