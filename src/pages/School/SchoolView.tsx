import React, { useState } from 'react';
import { mockSchool } from '../../services/mockData';
import clsx from 'clsx';
import { BookOpen, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

const SchoolView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'timetable' | 'homework'>('timetable');

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-6 px-2">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
                    Schule & Edupage
                </h2>
                <div className="flex bg-slate-800 rounded-lg p-1">
                    <button
                        onClick={() => setActiveTab('timetable')}
                        className={clsx("px-4 py-2 rounded-md transition", activeTab === 'timetable' ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white")}
                    >
                        Stundenplan
                    </button>
                    <button
                        onClick={() => setActiveTab('homework')}
                        className={clsx("px-4 py-2 rounded-md transition", activeTab === 'homework' ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white")}
                    >
                        Hausaufgaben
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-20">
                {activeTab === 'timetable' && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-slate-400 uppercase tracking-wider mb-4">Heute</h3>
                        {mockSchool.timetable.map(period => (
                            <div key={period.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between">
                                <div className="flex items-center space-x-4">
                                    <div className="p-3 bg-indigo-500/20 text-indigo-300 rounded-xl">
                                        <Clock className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <div className="text-xl font-bold text-white">{period.subject}</div>
                                        <div className="text-slate-400">{period.time}</div>
                                    </div>
                                </div>
                                <div className="text-2xl font-bold text-slate-500">{period.room}</div>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'homework' && (
                    <div className="space-y-4">
                        {mockSchool.homework.map(hw => (
                            <div key={hw.id} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 flex items-start space-x-4">
                                <div className="p-3 bg-purple-500/20 text-purple-300 rounded-xl mt-1">
                                    <BookOpen className="w-6 h-6" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-start">
                                        <div className="text-lg font-bold text-white">{hw.subject}</div>
                                        <span className="text-sm px-2 py-1 bg-red-500/20 text-red-300 rounded border border-red-500/30">
                                            bis {format(hw.due, 'dd.MM.', { locale: de })}
                                        </span>
                                    </div>
                                    <div className="text-slate-300 mt-2 text-lg">{hw.task}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SchoolView;
