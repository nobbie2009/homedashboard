import React, { useState } from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { useEdupage } from '../../hooks/useEdupage';
import { GraduationCap, BookOpen, Clock, AlertCircle, MessageSquare, Trophy } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export const SchoolView: React.FC = () => {
    const { config } = useConfig();
    const { students, loading, error } = useEdupage();

    // State to track active tab for each student index
    // Default to 'timetable'
    const [activeTabs, setActiveTabs] = useState<Record<number, string>>({});

    const getActiveTab = (idx: number) => activeTabs[idx] || 'timetable';
    const setActiveTab = (idx: number, tab: string) => setActiveTabs(prev => ({ ...prev, [idx]: tab }));

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
            {students.map((student, idx) => {
                const currentTab = getActiveTab(idx);

                return (
                    <div key={idx} className="bg-slate-800/50 rounded-xl border border-slate-700 flex flex-col overflow-hidden shadow-lg backdrop-blur-sm">
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
                                <div className="space-y-3">
                                    {student.timetable.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                                            <Clock className="w-8 h-8 opacity-20 mb-2" />
                                            <p className="italic">Keine Stunden für heute/morgen.</p>
                                        </div>
                                    ) : (
                                        student.timetable.map((lesson) => (
                                            <div key={lesson.id} className="flex items-center bg-slate-700/40 p-3 rounded-lg border border-slate-600/30 hover:border-slate-500/50 transition">
                                                <div className="w-16 text-center border-r border-slate-600/50 pr-3 mr-3 flex flex-col justify-center">
                                                    <div className="text-white font-bold text-lg leading-none">{lesson.startTime}</div>
                                                    <div className="text-[10px] text-slate-400 mt-1">{lesson.endTime}</div>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="font-semibold text-blue-200 text-lg mb-0.5">{lesson.subject.name}</div>
                                                    <div className="text-xs text-slate-400 flex justify-between items-center">
                                                        <span className="bg-slate-800/50 px-1.5 py-0.5 rounded">{lesson.classroom?.name}</span>
                                                        <span className="italic opacity-75">{lesson.teacher?.name}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
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
                                            <p className="italic">Keine neuen Noten.</p>
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
    );
};


export default SchoolView;
