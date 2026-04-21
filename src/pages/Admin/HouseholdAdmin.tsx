import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2 } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import type {
    HouseholdMember, HouseholdTask, IntervalUnit, RecurrenceMode
} from '../../contexts/ConfigContext';

const PRESETS: { label: string; value: number; unit: IntervalUnit }[] = [
    { label: 'Wöchentlich', value: 1, unit: 'weeks' },
    { label: '14-tägig', value: 2, unit: 'weeks' },
    { label: 'Monatlich', value: 1, unit: 'months' },
    { label: 'Vierteljährlich', value: 3, unit: 'months' },
    { label: 'Halbjährlich', value: 6, unit: 'months' },
    { label: 'Jährlich', value: 12, unit: 'months' },
];

export const HouseholdAdmin: React.FC = () => {
    const { config, updateConfig } = useConfig();
    const household = config.household || { members: [], tasks: [] };

    const save = (next: typeof household) => updateConfig({ household: next });

    const addMember = () => {
        const m: HouseholdMember = {
            id: uuidv4(),
            name: 'Neues Mitglied',
            color: '#3b82f6'
        };
        save({ ...household, members: [...household.members, m] });
    };
    const updateMember = (id: string, patch: Partial<HouseholdMember>) => {
        save({ ...household, members: household.members.map(m => m.id === id ? { ...m, ...patch } : m) });
    };
    const deleteMember = (id: string) => {
        save({ ...household, members: household.members.filter(m => m.id !== id) });
    };

    const addTask = () => {
        const t: HouseholdTask = {
            id: uuidv4(),
            label: 'Neue Aufgabe',
            icon: 'Check',
            recurrence: { mode: 'relative', intervalValue: 1, intervalUnit: 'weeks' },
            nextDueAt: 0
        };
        save({ ...household, tasks: [...household.tasks, t] });
    };
    const updateTask = (id: string, patch: Partial<HouseholdTask>) => {
        save({
            ...household,
            tasks: household.tasks.map(t => t.id === id ? { ...t, ...patch } : t)
        });
    };
    const updateRecurrence = (id: string, patch: Partial<HouseholdTask['recurrence']>) => {
        save({
            ...household,
            tasks: household.tasks.map(t => t.id === id ? { ...t, recurrence: { ...t.recurrence, ...patch } } : t)
        });
    };
    const deleteTask = (id: string) => {
        save({ ...household, tasks: household.tasks.filter(t => t.id !== id) });
    };

    return (
        <div className="space-y-8 text-slate-900 dark:text-white">
            <section className="bg-slate-200/30 dark:bg-slate-800/30 p-6 rounded-xl border border-slate-300 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Haushaltsmitglieder</h3>
                    <button onClick={addMember} className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm">
                        <Plus className="w-4 h-4" /> Hinzufügen
                    </button>
                </div>
                <div className="space-y-2">
                    {household.members.map(m => (
                        <div key={m.id} className="grid grid-cols-[1fr_6rem_2rem] gap-2 items-center bg-white dark:bg-slate-800 rounded p-2 border border-slate-200 dark:border-slate-700">
                            <input
                                value={m.name}
                                onChange={e => updateMember(m.id, { name: e.target.value })}
                                className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                placeholder="Name"
                            />
                            <input
                                type="color"
                                value={m.color}
                                onChange={e => updateMember(m.id, { color: e.target.value })}
                                className="w-full h-9 rounded border border-slate-300 dark:border-slate-700"
                            />
                            <button onClick={() => deleteMember(m.id)} className="text-red-500 hover:text-red-400 p-2" title="Löschen">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    {household.members.length === 0 && (
                        <div className="text-slate-500 italic text-sm">Noch keine Mitglieder.</div>
                    )}
                </div>
            </section>

            <section className="bg-slate-200/30 dark:bg-slate-800/30 p-6 rounded-xl border border-slate-300 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Aufgaben</h3>
                    <button onClick={addTask} className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm">
                        <Plus className="w-4 h-4" /> Hinzufügen
                    </button>
                </div>
                <div className="space-y-4">
                    {household.tasks.map(t => (
                        <div key={t.id} className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-slate-200 dark:border-slate-700 space-y-2">
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_10rem_10rem_2rem] gap-2">
                                <input
                                    value={t.label}
                                    onChange={e => updateTask(t.id, { label: e.target.value })}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                    placeholder="Bezeichnung"
                                />
                                <input
                                    value={t.icon}
                                    onChange={e => updateTask(t.id, { icon: e.target.value })}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                    placeholder="Icon (z.B. Wrench)"
                                />
                                <select
                                    value={t.assignedTo || ''}
                                    onChange={e => updateTask(t.id, { assignedTo: e.target.value || undefined })}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                >
                                    <option value="">— Zuständig —</option>
                                    {household.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                                <button onClick={() => deleteTask(t.id)} className="text-red-500 hover:text-red-400 p-2" title="Löschen">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-[8rem_6rem_8rem_1fr] gap-2 items-center">
                                <select
                                    value={t.recurrence.mode}
                                    onChange={e => updateRecurrence(t.id, { mode: e.target.value as RecurrenceMode })}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                >
                                    <option value="relative">Ab Erledigung</option>
                                    <option value="absolute">Feste Termine</option>
                                </select>
                                <input
                                    type="number"
                                    min={1}
                                    value={t.recurrence.intervalValue}
                                    onChange={e => updateRecurrence(t.id, { intervalValue: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                />
                                <select
                                    value={t.recurrence.intervalUnit}
                                    onChange={e => updateRecurrence(t.id, { intervalUnit: e.target.value as IntervalUnit })}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                >
                                    <option value="days">Tage</option>
                                    <option value="weeks">Wochen</option>
                                    <option value="months">Monate</option>
                                </select>
                                {t.recurrence.mode === 'absolute' && (
                                    <input
                                        type="date"
                                        value={t.recurrence.startDate || ''}
                                        onChange={e => updateRecurrence(t.id, { startDate: e.target.value })}
                                        className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                    />
                                )}
                            </div>

                            <div className="flex flex-wrap gap-1">
                                {PRESETS.map(p => (
                                    <button
                                        key={p.label}
                                        onClick={() => updateRecurrence(t.id, { intervalValue: p.value, intervalUnit: p.unit })}
                                        className="text-xs px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600"
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>

                            {t.lastCompletedAt && (
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                    Zuletzt erledigt: {new Date(t.lastCompletedAt).toLocaleString('de-DE')}
                                    <button
                                        onClick={() => updateTask(t.id, { lastCompletedAt: undefined, lastCompletedBy: undefined })}
                                        className="ml-2 underline hover:text-slate-700 dark:hover:text-slate-200"
                                    >
                                        zurücksetzen
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                    {household.tasks.length === 0 && (
                        <div className="text-slate-500 italic text-sm">Noch keine Aufgaben.</div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default HouseholdAdmin;
