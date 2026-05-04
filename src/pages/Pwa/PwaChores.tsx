import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, Edit2, Save, X, Star, Check, ChevronRight } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { useSecurity } from '../../contexts/SecurityContext';
import { getApiUrl } from '../../utils/api';
import { ChoreIcon, IconMap } from '../../components/ChoreIcon';
import type { Chore, Kid } from '../../contexts/ConfigContext';

const ICON_KEYS = Object.keys(IconMap);
const ROTATIONS: { id: Chore['rotation']; label: string }[] = [
    { id: 'none', label: 'Fest' },
    { id: 'daily', label: 'Täglich' },
    { id: 'weekly', label: 'Wöchentlich' },
];

export const PwaChores: React.FC = () => {
    const { config, updateConfig } = useConfig();
    const { deviceId } = useSecurity();
    const API_URL = getApiUrl();

    const kids: Kid[] = config.chores?.kids || [];
    const tasks: Chore[] = config.chores?.tasks || [];
    const settings = config.chores?.settings || { interval: 'weekly' };

    const [editing, setEditing] = useState<Chore | null>(null);
    const [completed, setCompleted] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState('');

    const saveTasks = (next: Chore[]) => {
        updateConfig({
            chores: {
                kids,
                tasks: next,
                settings
            }
        });
    };

    const newTask = () => {
        const t: Chore = {
            id: uuidv4(),
            label: 'Neue Aufgabe',
            icon: 'clean',
            rotation: 'none',
            difficulty: 1,
            assignedTo: kids[0]?.id
        };
        setEditing(t);
    };

    const persistEditing = () => {
        if (!editing) return;
        const exists = tasks.find(t => t.id === editing.id);
        const next = exists
            ? tasks.map(t => t.id === editing.id ? editing : t)
            : [...tasks, editing];
        saveTasks(next);
        setEditing(null);
    };

    const deleteTask = (id: string) => {
        if (!confirm('Aufgabe wirklich löschen?')) return;
        saveTasks(tasks.filter(t => t.id !== id));
    };

    const completeTask = async (task: Chore) => {
        if (!task.assignedTo) {
            setError('Aufgabe ohne Kind zugewiesen');
            setTimeout(() => setError(''), 2500);
            return;
        }
        setBusy(task.id);
        setError('');
        const pin = config.adminPin || '1234';
        try {
            const res = await fetch(`${API_URL}/api/rewards/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({ taskId: task.id, kidId: task.assignedTo, pin })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Fehler');
            if (data.rewards) updateConfig({ rewards: data.rewards });
            setCompleted(prev => new Set(prev).add(task.id));
            setTimeout(() => setCompleted(prev => {
                const n = new Set(prev);
                n.delete(task.id);
                return n;
            }), 2000);
        } catch (e: any) {
            setError(e.message || 'Fehler beim Abschließen');
            setTimeout(() => setError(''), 2500);
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="p-4 max-w-xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Aufgaben für Sterne</h2>
                <button
                    onClick={newTask}
                    className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-lg active:scale-95"
                >
                    <Plus className="w-4 h-4" /> Neu
                </button>
            </div>

            {error && (
                <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg px-3 py-2 text-sm">
                    {error}
                </div>
            )}

            {kids.length === 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200 rounded-lg p-3 text-sm">
                    Hinweis: Keine Kinder im Admin angelegt. Aufgaben können noch nicht erledigt werden.
                </div>
            )}

            {/* Tasks grouped per kid */}
            {kids.map(kid => {
                const kidTasks = tasks.filter(t => t.assignedTo === kid.id);
                return (
                    <section key={kid.id} className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: kid.color }} />
                            <h3 className="font-bold uppercase tracking-wider text-sm">{kid.name}</h3>
                            <span className="text-xs text-slate-400">({kidTasks.length})</span>
                        </div>
                        {kidTasks.length === 0 ? (
                            <div className="text-sm text-slate-500 dark:text-slate-400 italic px-2">Keine Aufgaben</div>
                        ) : (
                            <div className="space-y-2">
                                {kidTasks.map(t => {
                                    const done = completed.has(t.id);
                                    return (
                                        <div
                                            key={t.id}
                                            className={`bg-white dark:bg-slate-800 rounded-xl border-l-4 border-r border-y border-slate-200 dark:border-slate-700 p-3 flex items-center gap-3 transition-all ${
                                                done ? 'ring-2 ring-green-400 bg-green-50 dark:bg-green-900/20' : ''
                                            }`}
                                            style={{ borderLeftColor: kid.color }}
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-none">
                                                <ChoreIcon icon={t.icon} className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold truncate">{t.label}</div>
                                                <div className="text-xs text-yellow-500">
                                                    {'★'.repeat(t.difficulty || 1)}
                                                    <span className="text-slate-400 ml-1">
                                                        {t.difficulty === 3 ? 'Schwer' : t.difficulty === 2 ? 'Mittel' : 'Leicht'}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => completeTask(t)}
                                                disabled={busy === t.id || done}
                                                className="flex-none bg-green-600 hover:bg-green-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white p-2 rounded-lg active:scale-95"
                                                title="Erledigt"
                                            >
                                                {done
                                                    ? <Check className="w-5 h-5" />
                                                    : busy === t.id
                                                        ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        : <Star className="w-5 h-5 fill-current" />
                                                }
                                            </button>
                                            <button
                                                onClick={() => setEditing(t)}
                                                className="flex-none p-2 text-slate-400 hover:text-blue-500 active:scale-95"
                                                title="Bearbeiten"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                );
            })}

            {/* Tasks without kid */}
            {(() => {
                const orphan = tasks.filter(t => !t.assignedTo || !kids.find(k => k.id === t.assignedTo));
                if (orphan.length === 0) return null;
                return (
                    <section className="space-y-2">
                        <h3 className="font-bold uppercase tracking-wider text-sm text-slate-500">Ohne Zuweisung</h3>
                        {orphan.map(t => (
                            <div key={t.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-none">
                                    <ChoreIcon icon={t.icon} className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold truncate">{t.label}</div>
                                </div>
                                <button onClick={() => setEditing(t)} className="p-2 text-slate-400 hover:text-blue-500">
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => deleteTask(t.id)} className="p-2 text-slate-400 hover:text-red-500">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </section>
                );
            })()}

            {/* Edit overlay */}
            {editing && (
                <ChoreEditor
                    task={editing}
                    kids={kids}
                    onChange={setEditing}
                    onCancel={() => setEditing(null)}
                    onSave={persistEditing}
                    onDelete={() => {
                        deleteTask(editing.id);
                        setEditing(null);
                    }}
                />
            )}
        </div>
    );
};

interface EditorProps {
    task: Chore;
    kids: Kid[];
    onChange: (t: Chore) => void;
    onSave: () => void;
    onCancel: () => void;
    onDelete: () => void;
}

const ChoreEditor: React.FC<EditorProps> = ({ task, kids, onChange, onSave, onCancel, onDelete }) => {
    const set = (patch: Partial<Chore>) => onChange({ ...task, ...patch });
    return (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center" onClick={onCancel}>
            <div
                onClick={e => e.stopPropagation()}
                className="bg-white dark:bg-slate-900 w-full max-w-md rounded-t-2xl md:rounded-2xl p-4 max-h-[90vh] overflow-y-auto space-y-4 border-t md:border border-slate-200 dark:border-slate-700"
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Aufgabe bearbeiten</h3>
                    <button onClick={onCancel} className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <label className="block">
                    <span className="text-xs font-semibold text-slate-500">Bezeichnung</span>
                    <input
                        autoFocus
                        value={task.label}
                        onChange={e => set({ label: e.target.value })}
                        className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
                    />
                </label>

                <label className="block">
                    <span className="text-xs font-semibold text-slate-500">Beschreibung</span>
                    <input
                        value={task.description || ''}
                        onChange={e => set({ description: e.target.value })}
                        className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
                    />
                </label>

                <div>
                    <span className="text-xs font-semibold text-slate-500">Kind</span>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                        {kids.map(k => (
                            <button
                                key={k.id}
                                onClick={() => set({ assignedTo: k.id })}
                                className={`px-3 py-2 rounded-lg border flex items-center gap-2 text-sm ${
                                    task.assignedTo === k.id
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-slate-200 dark:border-slate-700'
                                }`}
                            >
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: k.color }} />
                                <span className="truncate">{k.name}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <span className="text-xs font-semibold text-slate-500">Schwierigkeit (Sterne)</span>
                    <div className="flex gap-2 mt-1">
                        {[1, 2, 3].map(d => (
                            <button
                                key={d}
                                onClick={() => set({ difficulty: d as 1 | 2 | 3 })}
                                className={`flex-1 py-2 rounded-lg border text-sm font-bold ${
                                    task.difficulty === d
                                        ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600'
                                        : 'border-slate-200 dark:border-slate-700'
                                }`}
                            >
                                {'★'.repeat(d)}
                                <span className="text-[10px] ml-1 text-slate-400">
                                    {d === 1 ? 'Leicht' : d === 2 ? 'Mittel' : 'Schwer'}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <span className="text-xs font-semibold text-slate-500">Rotation</span>
                    <div className="flex gap-2 mt-1">
                        {ROTATIONS.map(r => (
                            <button
                                key={r.id}
                                onClick={() => set({ rotation: r.id })}
                                className={`flex-1 py-2 rounded-lg border text-sm ${
                                    task.rotation === r.id
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-slate-200 dark:border-slate-700'
                                }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <span className="text-xs font-semibold text-slate-500">Symbol</span>
                    <div className="grid grid-cols-6 gap-2 mt-1">
                        {ICON_KEYS.map(k => (
                            <button
                                key={k}
                                onClick={() => set({ icon: k })}
                                className={`aspect-square flex items-center justify-center rounded-lg border ${
                                    task.icon === k
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-slate-200 dark:border-slate-700'
                                }`}
                                title={k}
                            >
                                <ChoreIcon icon={k} className="w-5 h-5" />
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2 pt-2">
                    <button
                        onClick={onDelete}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                        <Trash2 className="w-4 h-4" /> Löschen
                    </button>
                    <div className="flex-1" />
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                        Abbrechen
                    </button>
                    <button
                        onClick={onSave}
                        className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg active:scale-95"
                    >
                        <Save className="w-4 h-4" /> Speichern
                    </button>
                </div>
            </div>
        </div>
    );
};

// Avoid unused var warnings
void ChevronRight;
