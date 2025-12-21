import React from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { ChoreIcon } from '../ChoreIcon';

export const ChoresWidget: React.FC = () => {
    const { config } = useConfig();
    const { kids, tasks } = config.chores || { kids: [], tasks: [] };

    // Group tasks by kid
    // Only show "active" tasks (assuming all configured tasks are active for now)
    return (
        <div className="flex flex-col p-4 bg-slate-800/60 rounded-xl backdrop-blur-md shadow-lg w-full h-full border border-slate-700 overflow-hidden">
            <h3 className="text-xl font-semibold text-slate-300 mb-2 uppercase tracking-wider">Aufgaben</h3>
            <div className="flex-1 flex flex-col justify-around space-y-2">
                {kids.map(kid => {
                    const kidTasks = tasks.filter(t => t.assignedTo === kid.id);

                    // Skip if no tasks? Or show empty state? Show empty row to keep balance
                    return (
                        <div key={kid.id} className="flex items-center bg-slate-700/40 rounded-lg p-1.5">
                            {/* Avatar/Name */}
                            <div className="flex flex-col items-center justify-center w-20 mr-3 border-r border-slate-600/50 pr-2">
                                {kid.photo ? (
                                    <img src={kid.photo} alt={kid.name} className="w-8 h-8 rounded-full object-cover mb-1 border-2" style={{ borderColor: kid.color }} />
                                ) : (
                                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs border-2" style={{ backgroundColor: kid.color, borderColor: 'rgba(255,255,255,0.2)' }}>
                                        {kid.name.substring(0, 2).toUpperCase()}
                                    </div>
                                )}
                                <span className="text-xs text-slate-300 font-medium text-center uppercase tracking-wide break-words w-full leading-tight">{kid.name}</span>
                            </div>

                            {/* Tasks Icons & Labels */}
                            <div className="flex-1 flex flex-wrap gap-2 items-center">
                                {kidTasks.length > 0 ? (
                                    kidTasks.map(task => (
                                        <div key={task.id} className="flex items-center gap-1.5 px-2 py-1 bg-slate-600/50 rounded text-slate-200">
                                            <ChoreIcon icon={task.icon} className="w-3.5 h-3.5 flex-shrink-0 opacity-80" />
                                            <span className="text-xs font-medium leading-none">{task.label}</span>
                                        </div>
                                    ))
                                ) : (
                                    <span className="text-slate-500 text-[10px] italic ml-2">Frei!</span>
                                )}
                            </div>
                        </div>
                    );
                })}

                {(!kids || kids.length === 0) && (
                    <div className="text-slate-500 text-sm italic text-center">Keine Kinder konfiguriert</div>
                )}
            </div>
        </div>
    );
};
