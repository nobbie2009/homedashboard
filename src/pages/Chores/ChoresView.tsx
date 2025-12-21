import React from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { ChoreIcon } from '../../components/ChoreIcon';
import { PartyPopper } from 'lucide-react';

const ChoresView: React.FC = () => {
    const { config } = useConfig();
    const { kids, tasks } = config.chores || { kids: [], tasks: [] };

    return (
        <div className="h-full w-full p-6 bg-slate-900 text-white overflow-y-auto">
            <header className="mb-8 text-center">
                <h1 className="text-4xl font-bold text-yellow-500 drop-shadow-md tracking-wider">🌟 Eure Aufgaben 🌟</h1>
            </header>

            {(!kids || kids.length === 0) ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <p className="text-2xl">Keine Kinder konfiguriert</p>
                    <p>Bitte in den Einstellungen Kinder hinzufügen.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {kids.map(kid => {
                        const kidTasks = tasks.filter(t => t.assignedTo === kid.id);
                        const hasTasks = kidTasks.length > 0;

                        return (
                            <div
                                key={kid.id}
                                className="rounded-2xl overflow-hidden shadow-2xl border-4 transform transition hover:scale-[1.02]"
                                style={{
                                    borderColor: kid.color,
                                    backgroundColor: 'rgba(30, 41, 59, 0.8)' // dark slate-800 with opacity
                                }}
                            >
                                {/* Header / Avatar Area */}
                                <div
                                    className="p-6 flex flex-col items-center justify-center relative overflow-hidden"
                                    style={{ backgroundColor: `${kid.color}33` }} // 20% opacity of kid color
                                >
                                    {/* Decorative background circle */}
                                    <div
                                        className="absolute w-64 h-64 rounded-full blur-3xl -z-10 opacity-30"
                                        style={{ backgroundColor: kid.color }}
                                    />

                                    {kid.photo ? (
                                        <img
                                            src={kid.photo}
                                            alt={kid.name}
                                            className="w-32 h-32 rounded-full object-cover border-4 shadow-lg mb-4"
                                            style={{ borderColor: kid.color }}
                                        />
                                    ) : (
                                        <div
                                            className="w-32 h-32 rounded-full flex items-center justify-center text-white font-bold text-4xl border-4 shadow-lg mb-4"
                                            style={{ backgroundColor: kid.color, borderColor: 'white' }}
                                        >
                                            {kid.name.substring(0, 2).toUpperCase()}
                                        </div>
                                    )}
                                    <h2 className="text-3xl font-black uppercase tracking-widest drop-shadow-sm">{kid.name}</h2>
                                </div>

                                {/* Tasks List */}
                                <div className="p-6 space-y-4">
                                    {hasTasks ? (
                                        kidTasks.map(task => (
                                            <div
                                                key={task.id}
                                                className="flex items-center gap-4 p-4 bg-slate-800/80 rounded-xl border-l-8 shadow-sm"
                                                style={{ borderLeftColor: kid.color }}
                                            >
                                                <div className="p-3 bg-slate-700 rounded-full">
                                                    <ChoreIcon icon={task.icon} className="w-8 h-8 text-white" />
                                                </div>
                                                <span className="text-2xl font-bold text-slate-100">{task.label}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-8 text-center space-y-4 opacity-70">
                                            <PartyPopper className="w-16 h-16 text-yellow-400 animate-bounce" />
                                            <div className="space-y-1">
                                                <p className="text-2xl font-bold text-green-400">Juhu!</p>
                                                <p className="text-lg text-slate-300">Alles erledigt!</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ChoresView;
