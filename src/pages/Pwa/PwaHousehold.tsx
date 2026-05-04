import React, { useEffect, useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import {
    Plus, Trash2, Edit2, Save, CheckCircle2, Undo2, AlertTriangle, Users
} from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { de } from 'date-fns/locale';
import { useConfig } from '../../contexts/ConfigContext';
import { useSecurity } from '../../contexts/SecurityContext';
import { getApiUrl } from '../../utils/api';
import { ChoreIcon, IconMap } from '../../components/ChoreIcon';
import { Sheet } from './Sheet';
import type {
    HouseholdMember, HouseholdTask, IntervalUnit, RecurrenceMode
} from '../../contexts/ConfigContext';

const ICON_KEYS = Object.keys(IconMap);
const UNDO_MS = 30_000;

const PRESETS: { label: string; value: number; unit: IntervalUnit }[] = [
    { label: 'Wöchentlich', value: 1, unit: 'weeks' },
    { label: '14-tägig', value: 2, unit: 'weeks' },
    { label: 'Monatlich', value: 1, unit: 'months' },
    { label: 'Vierteljährlich', value: 3, unit: 'months' },
    { label: 'Halbjährlich', value: 6, unit: 'months' },
    { label: 'Jährlich', value: 12, unit: 'months' },
];

interface ServerState {
    tasks: HouseholdTask[];
    members: HouseholdMember[];
    now: number;
}

export const PwaHousehold: React.FC = () => {
    const { config, updateConfig } = useConfig();
    const { deviceId } = useSecurity();
    const API_URL = getApiUrl();

    const household = config.household || { members: [], tasks: [] };

    const [serverState, setServerState] = useState<ServerState | null>(null);
    const [editingTask, setEditingTask] = useState<HouseholdTask | null>(null);
    const [editingMember, setEditingMember] = useState<HouseholdMember | null>(null);
    const [showMembers, setShowMembers] = useState(false);
    const [picker, setPicker] = useState<HouseholdTask | null>(null);
    const [undo, setUndo] = useState<{ taskId: string; completedAt: number } | null>(null);
    const [undoLeft, setUndoLeft] = useState(0);
    const [error, setError] = useState('');
    const undoTimer = useRef<number | null>(null);

    const fetchTasks = useCallback(async () => {
        if (!deviceId) return;
        try {
            const res = await fetch(`${API_URL}/api/household/tasks`, {
                headers: { 'x-device-id': deviceId }
            });
            if (!res.ok) throw new Error('http');
            const j: ServerState = await res.json();
            setServerState(j);
        } catch {
            // fall back to local config snapshot
        }
    }, [API_URL, deviceId]);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    useEffect(() => {
        if (!undo) {
            if (undoTimer.current) window.clearInterval(undoTimer.current);
            return;
        }
        const tick = () => {
            const left = UNDO_MS - (Date.now() - undo.completedAt);
            if (left <= 0) { setUndo(null); setUndoLeft(0); return; }
            setUndoLeft(left);
        };
        tick();
        const id = window.setInterval(tick, 250);
        undoTimer.current = id;
        return () => window.clearInterval(id);
    }, [undo]);

    const tasks = serverState?.tasks || household.tasks || [];
    // Members come straight from the local config so additions/edits show
    // immediately — the server fetch can race with the config POST and
    // would otherwise display stale data until the next manual refresh.
    const members = household.members || [];
    const now = serverState?.now || Date.now();

    const persistMembers = (next: HouseholdMember[]) => {
        updateConfig({ household: { members: next, tasks: household.tasks } });
        // Refetch so server-side derived task data picks up the new member info
        setTimeout(fetchTasks, 600);
    };
    const persistTasks = (next: HouseholdTask[]) => {
        updateConfig({ household: { members: household.members, tasks: next } });
        // Server recomputes nextDueAt etc. — give the POST time to land
        setTimeout(fetchTasks, 600);
    };

    const newMember = () => {
        setEditingMember({ id: uuidv4(), name: '', color: '#3b82f6' });
    };
    const newTask = () => {
        setEditingTask({
            id: uuidv4(),
            label: '',
            icon: 'clean',
            recurrence: { mode: 'relative', intervalValue: 1, intervalUnit: 'weeks' },
            nextDueAt: 0
        });
    };

    const saveMember = () => {
        if (!editingMember || !editingMember.name.trim()) return;
        const exists = household.members.find(m => m.id === editingMember.id);
        const next = exists
            ? household.members.map(m => m.id === editingMember.id ? editingMember : m)
            : [...household.members, editingMember];
        persistMembers(next);
        setEditingMember(null);
    };
    const deleteMember = (id: string) => {
        if (!confirm('Mitglied wirklich löschen?')) return;
        persistMembers(household.members.filter(m => m.id !== id));
    };

    const saveTask = () => {
        if (!editingTask || !editingTask.label.trim()) return;
        const exists = household.tasks.find(t => t.id === editingTask.id);
        const next = exists
            ? household.tasks.map(t => t.id === editingTask.id ? editingTask : t)
            : [...household.tasks, editingTask];
        persistTasks(next);
        setEditingTask(null);
    };
    const deleteTask = (id: string) => {
        if (!confirm('Aufgabe wirklich löschen?')) return;
        persistTasks(household.tasks.filter(t => t.id !== id));
        setEditingTask(null);
    };

    const completeTask = async (task: HouseholdTask, memberId?: string) => {
        try {
            const res = await fetch(`${API_URL}/api/household/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({ taskId: task.id, memberId })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Fehler');
                setTimeout(() => setError(''), 2500);
                return;
            }
            const j = await res.json();
            setUndo({ taskId: task.id, completedAt: j.completedAt });
            fetchTasks();
        } catch {
            setError('Verbindungsfehler');
            setTimeout(() => setError(''), 2500);
        }
    };

    const onCardClick = (task: HouseholdTask) => {
        if (members.length <= 1) {
            completeTask(task, members[0]?.id);
        } else {
            setPicker(task);
        }
    };

    const doUndo = async () => {
        if (!undo) return;
        try {
            await fetch(`${API_URL}/api/household/undo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({ taskId: undo.taskId })
            });
        } catch {}
        setUndo(null);
        fetchTasks();
    };

    return (
        <div className="p-4 max-w-xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">Haushalt</h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowMembers(s => !s)}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm"
                    >
                        <Users className="w-4 h-4" />
                        {showMembers ? 'Aufgaben' : 'Mitglieder'}
                    </button>
                    <button
                        onClick={showMembers ? newMember : newTask}
                        className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-lg active:scale-95"
                    >
                        <Plus className="w-4 h-4" /> Neu
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg px-3 py-2 text-sm">
                    {error}
                </div>
            )}

            {showMembers ? (
                <div className="space-y-2">
                    {members.length === 0 && (
                        <div className="text-sm text-slate-500 italic">Noch keine Mitglieder.</div>
                    )}
                    {members.map(m => (
                        <div key={m.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex items-center gap-3">
                            <span className="w-8 h-8 rounded-full" style={{ backgroundColor: m.color }} />
                            <div className="flex-1 font-bold">{m.name}</div>
                            <button onClick={() => setEditingMember(m)} className="p-2 text-slate-400 hover:text-blue-500">
                                <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteMember(m.id)} className="p-2 text-slate-400 hover:text-red-500">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-2">
                    {tasks.length === 0 && (
                        <div className="text-sm text-slate-500 italic">Keine Aufgaben.</div>
                    )}
                    {tasks.map(t => {
                        const member = members.find(m => m.id === t.assignedTo);
                        const lastMember = members.find(m => m.id === t.lastCompletedBy);
                        const overdue = t.nextDueAt && t.nextDueAt < now;
                        const dueSoon = !overdue && t.nextDueAt && t.nextDueAt - now <= 3 * 24 * 3600 * 1000;
                        const borderClass = overdue
                            ? 'border-red-500 dark:border-red-600'
                            : dueSoon
                                ? 'border-yellow-500 dark:border-yellow-600'
                                : 'border-slate-300 dark:border-slate-700';
                        return (
                            <div
                                key={t.id}
                                className={`bg-white dark:bg-slate-800 rounded-xl border-2 ${borderClass} p-3 space-y-2`}
                            >
                                <div className="flex items-center gap-2">
                                    {overdue && <AlertTriangle className="w-4 h-4 text-red-500 flex-none" />}
                                    {member && (
                                        <span className="w-3 h-3 rounded-full flex-none" style={{ backgroundColor: member.color }} />
                                    )}
                                    <ChoreIcon icon={t.icon} className="w-5 h-5 flex-none" />
                                    <span className="font-bold flex-1 truncate">{t.label}</span>
                                    <button
                                        onClick={() => setEditingTask(t)}
                                        className="p-1.5 text-slate-400 hover:text-blue-500"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className={`text-sm ${overdue ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-600 dark:text-slate-300'}`}>
                                    {t.nextDueAt
                                        ? (t.nextDueAt < now
                                            ? `überfällig seit ${formatDistanceToNowStrict(t.nextDueAt, { locale: de })}`
                                            : `in ${formatDistanceToNowStrict(t.nextDueAt, { locale: de })}`)
                                        : 'Noch nicht fällig'}
                                    {' · '}
                                    alle {t.recurrence.intervalValue} {labelUnit(t.recurrence.intervalUnit, t.recurrence.intervalValue)}
                                </div>
                                {t.lastCompletedAt && (
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        Zuletzt: {new Date(t.lastCompletedAt).toLocaleDateString('de-DE')}
                                        {lastMember ? ` (${lastMember.name})` : ''}
                                    </div>
                                )}
                                <button
                                    onClick={() => onCardClick(t)}
                                    className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg active:scale-95"
                                >
                                    <CheckCircle2 className="w-5 h-5" /> Erledigt
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Member Editor */}
            {editingMember && (
                <Sheet
                    title="Mitglied"
                    onClose={() => setEditingMember(null)}
                    footer={
                        <>
                            <div className="flex-1" />
                            <button onClick={() => setEditingMember(null)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700">Abbrechen</button>
                            <button onClick={saveMember} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-1">
                                <Save className="w-4 h-4" /> Speichern
                            </button>
                        </>
                    }
                >
                    <input
                        autoFocus
                        value={editingMember.name}
                        onChange={e => setEditingMember({ ...editingMember, name: e.target.value })}
                        placeholder="Name"
                        className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
                    />
                    <label className="flex items-center gap-2">
                        <span className="text-sm">Farbe</span>
                        <input
                            type="color"
                            value={editingMember.color}
                            onChange={e => setEditingMember({ ...editingMember, color: e.target.value })}
                            className="h-9 w-16 rounded border border-slate-200 dark:border-slate-700"
                        />
                    </label>
                </Sheet>
            )}

            {/* Task Editor */}
            {editingTask && (
                <HouseholdTaskEditor
                    task={editingTask}
                    members={members}
                    onChange={setEditingTask}
                    onCancel={() => setEditingTask(null)}
                    onSave={saveTask}
                    onDelete={() => deleteTask(editingTask.id)}
                />
            )}

            {/* Member picker */}
            {picker && (
                <Sheet title="Wer hat es erledigt?" onClose={() => setPicker(null)}>
                    <div className="grid grid-cols-2 gap-2">
                        {members.map(m => (
                            <button
                                key={m.id}
                                onClick={() => { completeTask(picker, m.id); setPicker(null); }}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 active:scale-95"
                            >
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
                                <span className="font-semibold">{m.name}</span>
                            </button>
                        ))}
                    </div>
                </Sheet>
            )}

            {/* Undo banner */}
            {undo && (
                <div className="fixed bottom-24 inset-x-0 flex justify-center pointer-events-none z-40">
                    <button
                        onClick={doUndo}
                        className="pointer-events-auto bg-slate-800 text-white px-5 py-3 rounded-full shadow-lg flex items-center gap-2 border border-slate-700"
                    >
                        <Undo2 className="w-5 h-5" />
                        <span className="font-semibold">Rückgängig</span>
                        <span className="text-slate-400 text-sm tabular-nums">{Math.ceil(undoLeft / 1000)}s</span>
                    </button>
                </div>
            )}
        </div>
    );
};

const labelUnit = (unit: IntervalUnit, n: number): string => {
    if (unit === 'days') return n === 1 ? 'Tag' : 'Tagen';
    if (unit === 'weeks') return n === 1 ? 'Woche' : 'Wochen';
    return n === 1 ? 'Monat' : 'Monaten';
};

interface HouseholdTaskEditorProps {
    task: HouseholdTask;
    members: HouseholdMember[];
    onChange: (t: HouseholdTask) => void;
    onSave: () => void;
    onCancel: () => void;
    onDelete: () => void;
}

const HouseholdTaskEditor: React.FC<HouseholdTaskEditorProps> = ({ task, members, onChange, onSave, onCancel, onDelete }) => {
    const set = (patch: Partial<HouseholdTask>) => onChange({ ...task, ...patch });
    const setRec = (patch: Partial<HouseholdTask['recurrence']>) =>
        onChange({ ...task, recurrence: { ...task.recurrence, ...patch } });

    return (
        <Sheet
            title="Aufgabe"
            onClose={onCancel}
            footer={
                <>
                    <button onClick={onDelete} className="flex items-center gap-1 px-3 py-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="w-4 h-4" /> Löschen
                    </button>
                    <div className="flex-1" />
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700">Abbrechen</button>
                    <button onClick={onSave} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-1">
                        <Save className="w-4 h-4" /> Speichern
                    </button>
                </>
            }
        >
                <input
                    autoFocus
                    value={task.label}
                    onChange={e => set({ label: e.target.value })}
                    placeholder="Bezeichnung"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
                />

                <input
                    value={task.description || ''}
                    onChange={e => set({ description: e.target.value })}
                    placeholder="Beschreibung (optional)"
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
                />

                <div>
                    <span className="text-xs font-semibold text-slate-500">Zuständig</span>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                            onClick={() => set({ assignedTo: undefined })}
                            className={`px-3 py-2 rounded-lg border text-sm text-left ${
                                !task.assignedTo
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-slate-200 dark:border-slate-700'
                            }`}
                        >
                            — Niemand —
                        </button>
                        {members.map(m => (
                            <button
                                key={m.id}
                                onClick={() => set({ assignedTo: m.id })}
                                className={`px-3 py-2 rounded-lg border flex items-center gap-2 text-sm ${
                                    task.assignedTo === m.id
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : 'border-slate-200 dark:border-slate-700'
                                }`}
                            >
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
                                <span className="truncate">{m.name}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <span className="text-xs font-semibold text-slate-500">Wiederholung</span>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                            onClick={() => setRec({ mode: 'relative' as RecurrenceMode })}
                            className={`px-3 py-2 rounded-lg border text-sm ${
                                task.recurrence.mode === 'relative'
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-slate-200 dark:border-slate-700'
                            }`}
                        >Ab Erledigung</button>
                        <button
                            onClick={() => setRec({ mode: 'absolute' as RecurrenceMode })}
                            className={`px-3 py-2 rounded-lg border text-sm ${
                                task.recurrence.mode === 'absolute'
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-slate-200 dark:border-slate-700'
                            }`}
                        >Feste Termine</button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <input
                            type="number"
                            min={1}
                            value={task.recurrence.intervalValue}
                            onChange={e => setRec({ intervalValue: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
                        />
                        <select
                            value={task.recurrence.intervalUnit}
                            onChange={e => setRec({ intervalUnit: e.target.value as IntervalUnit })}
                            className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
                        >
                            <option value="days">Tage</option>
                            <option value="weeks">Wochen</option>
                            <option value="months">Monate</option>
                        </select>
                    </div>

                    {task.recurrence.mode === 'absolute' && (
                        <input
                            type="date"
                            value={task.recurrence.startDate || ''}
                            onChange={e => setRec({ startDate: e.target.value })}
                            className="mt-2 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
                        />
                    )}

                    <div className="flex flex-wrap gap-1 mt-2">
                        {PRESETS.map(p => (
                            <button
                                key={p.label}
                                onClick={() => setRec({ intervalValue: p.value, intervalUnit: p.unit })}
                                className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
                            >
                                {p.label}
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

        </Sheet>
    );
};
