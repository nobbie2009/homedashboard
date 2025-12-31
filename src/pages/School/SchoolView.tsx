import React, { useState } from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { useEdupage } from '../../hooks/useEdupage';
import { GraduationCap, Clock, AlertCircle, MessageSquare, RefreshCw } from 'lucide-react';
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

                                {/* TIMETABLE - Grid Layout like Edupage */}
                                {currentTab === 'timetable' && (
                                    <div className="overflow-x-auto">
                                        {(() => {
                                            // Subject color mapping - similar to Edupage
                                            const getSubjectColor = (subjectName: string, subjectShort: string): string => {
                                                const name = subjectName.toLowerCase();
                                                const short = subjectShort.toLowerCase();

                                                if (name.includes('deutsch') || short === 'de') {
                                                    return 'bg-purple-500/70 border-purple-400/50 text-white';
                                                }
                                                if (name.includes('mathe') || short === 'ma') {
                                                    return 'bg-blue-500/70 border-blue-400/50 text-white';
                                                }
                                                if (name.includes('heimat') || name.includes('sachkunde') || short === 'hsk' || short === 'hus') {
                                                    return 'bg-green-500/70 border-green-400/50 text-white';
                                                }
                                                if (name.includes('sport') || short === 'sp') {
                                                    return 'bg-lime-500/70 border-lime-400/50 text-white';
                                                }
                                                if (name.includes('musik') || short === 'mu') {
                                                    return 'bg-orange-400/70 border-orange-300/50 text-white';
                                                }
                                                if (name.includes('kunst') || name.includes('werken') || short === 'ku' || short === 'wk') {
                                                    return 'bg-pink-500/70 border-pink-400/50 text-white';
                                                }
                                                if (name.includes('religion') || name.includes('ethik') || short === 'rel' || short === 'eth') {
                                                    return 'bg-amber-500/70 border-amber-400/50 text-white';
                                                }
                                                if (name.includes('ergänz') || short === 'erg') {
                                                    return 'bg-cyan-500/70 border-cyan-400/50 text-white';
                                                }
                                                if (name.includes('garten') || short === 'sg') {
                                                    return 'bg-teal-500/70 border-teal-400/50 text-white';
                                                }
                                                return 'bg-slate-500/70 border-slate-400/50 text-white';
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
                                            const groupedByDate: Record<string, typeof student.timetable> = {};
                                            student.timetable.forEach(lesson => {
                                                const dateKey = lesson.date.split('T')[0];
                                                if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
                                                groupedByDate[dateKey].push(lesson);
                                            });

                                            // Get all unique periods (time slots) across all days
                                            const allPeriods = new Set<string>();
                                            student.timetable.forEach(lesson => {
                                                allPeriods.add(`${lesson.startTime}-${lesson.endTime}`);
                                            });
                                            const sortedPeriods = Array.from(allPeriods).sort((a, b) => {
                                                const timeA = a.split('-')[0];
                                                const timeB = b.split('-')[0];
                                                return timeA.localeCompare(timeB);
                                            });

                                            // Sort dates (columns)
                                            const sortedDates = Object.keys(groupedByDate).sort();

                                            // Create lookup: date + period -> lesson
                                            const lessonMap = new Map<string, typeof student.timetable[0]>();
                                            student.timetable.forEach(lesson => {
                                                const key = `${lesson.date.split('T')[0]}_${lesson.startTime}-${lesson.endTime}`;
                                                lessonMap.set(key, lesson);
                                            });

                                            // Day name abbreviations
                                            const getDayAbbr = (dateStr: string) => {
                                                const date = new Date(dateStr);
                                                return format(date, 'EEE', { locale: de });
                                            };
                                            const getDateStr = (dateStr: string) => {
                                                const date = new Date(dateStr);
                                                return format(date, 'dd.MM.', { locale: de });
                                            };

                                            return (
                                                <table className="w-full border-collapse text-xs">
                                                    {/* Header row - Days */}
                                                    <thead>
                                                        <tr>
                                                            <th className="p-1 text-slate-400 text-[10px] font-normal w-12 border-b border-slate-700"></th>
                                                            {sortedDates.map(dateKey => (
                                                                <th key={dateKey} className="p-1 text-center border-b border-slate-700 min-w-[60px]">
                                                                    <div className="text-slate-300 font-bold text-sm">{getDayAbbr(dateKey)}</div>
                                                                    <div className="text-slate-500 text-[10px]">{getDateStr(dateKey)}</div>
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    {/* Body - Periods as rows */}
                                                    <tbody>
                                                        {sortedPeriods.map((period, pIdx) => {
                                                            const [startTime, endTime] = period.split('-');
                                                            return (
                                                                <tr key={period} className={pIdx % 2 === 0 ? 'bg-slate-800/20' : ''}>
                                                                    {/* Period time column */}
                                                                    <td className="p-1 text-center border-r border-slate-700 text-[10px] text-slate-400 align-top">
                                                                        <div className="font-bold text-slate-300">{pIdx + 1}</div>
                                                                        <div>{startTime}</div>
                                                                        <div className="opacity-60">{endTime}</div>
                                                                    </td>
                                                                    {/* Lesson cells for each day */}
                                                                    {sortedDates.map(dateKey => {
                                                                        const key = `${dateKey}_${period}`;
                                                                        const lesson = lessonMap.get(key);

                                                                        if (lesson) {
                                                                            const subjectColor = getSubjectColor(lesson.subject.name, lesson.subject.short);
                                                                            return (
                                                                                <td key={dateKey} className="p-0.5 align-top">
                                                                                    <div className={`p-1.5 rounded border h-full min-h-[50px] ${subjectColor}`}>
                                                                                        <div className="font-bold text-sm text-center">{lesson.subject.short || lesson.subject.name.substring(0, 3)}</div>
                                                                                        <div className="text-[9px] opacity-80 text-center mt-0.5 truncate">{lesson.teacher?.name?.split(' ').pop()}</div>
                                                                                    </div>
                                                                                </td>
                                                                            );
                                                                        } else {
                                                                            return (
                                                                                <td key={dateKey} className="p-0.5 align-top">
                                                                                    <div className="min-h-[50px]"></div>
                                                                                </td>
                                                                            );
                                                                        }
                                                                    })}
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            );
                                        })()}
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
