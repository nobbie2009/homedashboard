import React, { useState } from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import type { Chore, Kid } from '../../contexts/ConfigContext';
import { useSecurity } from '../../contexts/SecurityContext';
import { ChoreIcon } from '../../components/ChoreIcon';
import { PartyPopper, Star } from 'lucide-react';
import { PinConfirmOverlay } from '../../components/overlays/PinConfirmOverlay';
import { getApiUrl } from '../../utils/api';

const ChoresView: React.FC = () => {
    const { config, updateConfig } = useConfig();
    const { deviceId } = useSecurity();
    const { kids, tasks } = config.chores || { kids: [], tasks: [] };

    const [completingTask, setCompletingTask] = useState<{ task: Chore; kid: Kid } | null>(null);
    const [pinError, setPinError] = useState('');
    const [pinLoading, setPinLoading] = useState(false);
    const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set());

    const API_URL = getApiUrl();

    const handleCompleteTask = async (pin: string) => {
        if (!completingTask) return;
        setPinLoading(true);
        setPinError('');
        try {
            const res = await fetch(`${API_URL}/api/rewards/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({
                    taskId: completingTask.task.id,
                    kidId: completingTask.kid.id,
                    pin
                })
            });
            const data = await res.json();
            if (!res.ok) {
                setPinError(data.error || 'Fehler');
                return;
            }
            // Update rewards in config context so star counts are reflected everywhere
            if (data.rewards) {
                updateConfig({ rewards: data.rewards });
            }
            // Success animation
            const taskId = completingTask.task.id;
            setCompletedTaskIds(prev => new Set(prev).add(taskId));
            setCompletingTask(null);
            setPinError('');
            setTimeout(() => {
                setCompletedTaskIds(prev => {
                    const next = new Set(prev);
                    next.delete(taskId);
                    return next;
                });
            }, 2000);
        } catch {
            setPinError('Verbindungsfehler');
        } finally {
            setPinLoading(false);
        }
    };

    return (
        <div className="h-full w-full p-6 bg-white dark:bg-slate-900 text-slate-900 dark:text-white overflow-y-auto">
            <header className="mb-8 text-center flex items-center justify-center gap-3">
                <Star className="w-8 h-8 text-yellow-400 fill-yellow-400" />
                <h1 className="text-4xl font-bold text-yellow-500 drop-shadow-md tracking-wider">Eure Aufgaben</h1>
                <Star className="w-8 h-8 text-yellow-400 fill-yellow-400" />
            </header>

            {(!kids || kids.length === 0) ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400 dark:text-slate-500">
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
                                    backgroundColor: 'rgba(30, 41, 59, 0.8)'
                                }}
                            >
                                {/* Header / Avatar Area */}
                                <div
                                    className="p-6 flex flex-col items-center justify-center relative overflow-hidden"
                                    style={{ backgroundColor: `${kid.color}33` }}
                                >
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
                                                className={`flex items-center gap-4 p-4 bg-slate-200/80 dark:bg-slate-800/80 rounded-xl border-l-8 shadow-sm transition-all duration-500 ${
                                                    completedTaskIds.has(task.id)
                                                        ? 'ring-4 ring-green-400 bg-green-900/30'
                                                        : ''
                                                }`}
                                                style={{ borderLeftColor: kid.color }}
                                            >
                                                <div className="p-3 bg-slate-300 dark:bg-slate-700 rounded-full">
                                                    <ChoreIcon icon={task.icon} className="w-8 h-8 text-slate-900 dark:text-white" />
                                                </div>
                                                <div className="flex flex-col flex-1">
                                                    <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">{task.label}</span>
                                                    {task.description && <span className="text-sm text-slate-500 dark:text-slate-400 italic">{task.description}</span>}
                                                    <div className="text-xs text-yellow-400 mt-1">
                                                        {'★'.repeat(task.difficulty || 1)}
                                                        <span className="text-slate-400 dark:text-slate-500 ml-1">
                                                            {task.difficulty === 3 ? 'Schwer' : task.difficulty === 2 ? 'Mittel' : 'Leicht'}
                                                        </span>
                                                    </div>
                                                </div>
                                                {/* Complete button */}
                                                <button
                                                    onClick={() => setCompletingTask({ task, kid })}
                                                    className="ml-auto p-3 bg-green-600/20 hover:bg-green-600/40 rounded-xl transition active:scale-95 border border-green-600/30"
                                                    title="Als erledigt markieren"
                                                >
                                                    <Star className="w-7 h-7 text-yellow-400" />
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-8 text-center space-y-4 opacity-70">
                                            <PartyPopper className="w-16 h-16 text-yellow-400 animate-bounce" />
                                            <div className="space-y-1">
                                                <p className="text-2xl font-bold text-green-400">Juhu!</p>
                                                <p className="text-lg text-slate-600 dark:text-slate-300">Alles erledigt!</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* PIN Confirmation Overlay */}
            <PinConfirmOverlay
                active={!!completingTask}
                title="Aufgabe erledigt?"
                subtitle={completingTask
                    ? `${completingTask.kid.name}: ${completingTask.task.label} (+${completingTask.task.difficulty || 1} ★)`
                    : ''
                }
                onConfirm={handleCompleteTask}
                onCancel={() => { setCompletingTask(null); setPinError(''); }}
                error={pinError}
                loading={pinLoading}
            />
        </div>
    );
};

export default ChoresView;
