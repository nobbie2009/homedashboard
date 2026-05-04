import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, Edit2, Save, Clock, Droplets } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { Sheet } from './Sheet';
import { ChoreIcon, IconMap } from '../../components/ChoreIcon';
import type {
    BathroomItem, BathroomSchedule, Chore, Kid
} from '../../contexts/ConfigContext';

const ICON_KEYS = Object.keys(IconMap);

const DEFAULT_SCHEDULE: BathroomSchedule = {
    morningStart: '06:00', morningEnd: '10:00',
    eveningStart: '18:00', eveningEnd: '22:00'
};

const SLOTS: { id: BathroomItem['timeSlot']; label: string }[] = [
    { id: 'morning', label: 'Morgens' },
    { id: 'evening', label: 'Abends' },
    { id: 'both', label: 'Beides' },
];

export const PwaBath: React.FC = () => {
    const { config, updateConfig } = useConfig();
    const bathroom = config.bathroom || { items: [], schedule: DEFAULT_SCHEDULE };
    const kids: Kid[] = config.chores?.kids || [];
    const chores: Chore[] = config.chores?.tasks || [];

    const [editing, setEditing] = useState<BathroomItem | null>(null);
    const [scheduleDraft, setScheduleDraft] = useState<BathroomSchedule>(bathroom.schedule);
    const [scheduleError, setScheduleError] = useState('');
    const [scheduleFlash, setScheduleFlash] = useState(false);

    useEffect(() => {
        // Keep schedule draft in sync if backend pushes a change
        setScheduleDraft(bathroom.schedule);
    }, [bathroom.schedule.morningStart, bathroom.schedule.morningEnd, bathroom.schedule.eveningStart, bathroom.schedule.eveningEnd]);

    const validateSchedule = (s: BathroomSchedule): string | null => {
        const re = /^([01]\d|2[0-3]):[0-5]\d$/;
        const keys = ['morningStart', 'morningEnd', 'eveningStart', 'eveningEnd'] as const;
        for (const k of keys) {
            if (!re.test(s[k])) return `Ungültige Uhrzeit (${k})`;
        }
        if (s.morningStart >= s.morningEnd) return 'Morgen-Start muss vor Morgen-Ende liegen';
        if (s.eveningStart >= s.eveningEnd) return 'Abend-Start muss vor Abend-Ende liegen';
        if (s.morningStart < s.eveningEnd && s.eveningStart < s.morningEnd) {
            return 'Morgen- und Abend-Fenster überlappen';
        }
        return null;
    };

    const saveSchedule = () => {
        const err = validateSchedule(scheduleDraft);
        if (err) { setScheduleError(err); return; }
        setScheduleError('');
        updateConfig({ bathroom: { ...bathroom, schedule: scheduleDraft } });
        setScheduleFlash(true);
        setTimeout(() => setScheduleFlash(false), 1800);
    };

    const newItem = () => {
        setEditing({
            id: uuidv4(),
            label: '',
            icon: 'clean',
            assignedTo: kids[0]?.id || '',
            timeSlot: 'morning'
        });
    };

    const persistItems = (next: BathroomItem[]) => {
        updateConfig({ bathroom: { ...bathroom, items: next } });
    };

    const saveItem = () => {
        if (!editing || !editing.label.trim()) return;
        const exists = bathroom.items.find(i => i.id === editing.id);
        const next = exists
            ? bathroom.items.map(i => i.id === editing.id ? editing : i)
            : [...bathroom.items, editing];
        persistItems(next);
        setEditing(null);
    };

    const deleteItem = (id: string) => {
        if (!confirm('Aufgabe wirklich löschen?')) return;
        persistItems(bathroom.items.filter(i => i.id !== id));
        setEditing(null);
    };

    const morningItems = bathroom.items.filter(i => i.timeSlot === 'morning' || i.timeSlot === 'both');
    const eveningItems = bathroom.items.filter(i => i.timeSlot === 'evening' || i.timeSlot === 'both');

    return (
        <div className="p-4 max-w-xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold flex items-center gap-2">
                    <Droplets className="w-5 h-5 text-blue-500" /> Bad-Routine
                </h2>
                <button
                    onClick={newItem}
                    className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-lg active:scale-95"
                >
                    <Plus className="w-4 h-4" /> Neu
                </button>
            </div>

            {/* Schedule */}
            <section className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Zeitfenster
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    {([
                        ['morningStart', 'Morgen-Start'],
                        ['morningEnd', 'Morgen-Ende'],
                        ['eveningStart', 'Abend-Start'],
                        ['eveningEnd', 'Abend-Ende']
                    ] as const).map(([k, lbl]) => (
                        <label key={k} className="flex flex-col text-sm">
                            <span className="text-slate-500 dark:text-slate-400 mb-1">{lbl}</span>
                            <input
                                type="time"
                                value={scheduleDraft[k]}
                                onChange={e => setScheduleDraft({ ...scheduleDraft, [k]: e.target.value })}
                                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
                            />
                        </label>
                    ))}
                </div>
                {scheduleError && <div className="text-red-500 text-sm">{scheduleError}</div>}
                <div className="flex items-center gap-3">
                    <button
                        onClick={saveSchedule}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-1 active:scale-95"
                    >
                        <Save className="w-4 h-4" /> Speichern
                    </button>
                    {scheduleFlash && <span className="text-green-500 text-sm">Gespeichert</span>}
                </div>
            </section>

            {/* Items grouped by time slot */}
            {(['morning', 'evening'] as const).map(slot => {
                const items = slot === 'morning' ? morningItems : eveningItems;
                const title = slot === 'morning' ? 'Morgens' : 'Abends';
                return (
                    <section key={slot} className="space-y-2">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {title} ({items.length})
                        </h3>
                        {items.length === 0 ? (
                            <div className="text-sm text-slate-500 dark:text-slate-400 italic px-2">Keine Aufgaben</div>
                        ) : (
                            <div className="space-y-2">
                                {items.map(item => {
                                    const kid = kids.find(k => k.id === item.assignedTo);
                                    const linked = chores.find(c => c.id === item.linkedChoreId);
                                    return (
                                        <div
                                            key={item.id + slot}
                                            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex items-center gap-3"
                                            style={kid ? { borderLeft: `4px solid ${kid.color}` } : {}}
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-none">
                                                <ChoreIcon icon={item.icon} className="w-6 h-6" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold truncate">{item.label}</div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                                    {kid?.name || 'Niemand'}
                                                    {linked ? ` · ${'★'.repeat(linked.difficulty || 1)} ${linked.label}` : ''}
                                                    {item.timeSlot === 'both' ? ' · Beides' : ''}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => setEditing(item)}
                                                className="p-2 text-slate-400 hover:text-blue-500"
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

            {bathroom.items.length === 0 && (
                <div className="text-center text-slate-500 dark:text-slate-400 italic py-8 text-sm">
                    Noch keine Bad-Aufgaben. Tippe oben auf „Neu".
                </div>
            )}

            {editing && (
                <BathItemEditor
                    item={editing}
                    kids={kids}
                    chores={chores}
                    onChange={setEditing}
                    onCancel={() => setEditing(null)}
                    onSave={saveItem}
                    onDelete={() => deleteItem(editing.id)}
                />
            )}
        </div>
    );
};

interface EditorProps {
    item: BathroomItem;
    kids: Kid[];
    chores: Chore[];
    onChange: (i: BathroomItem) => void;
    onSave: () => void;
    onCancel: () => void;
    onDelete: () => void;
}

const BathItemEditor: React.FC<EditorProps> = ({ item, kids, chores, onChange, onSave, onCancel, onDelete }) => {
    const set = (patch: Partial<BathroomItem>) => onChange({ ...item, ...patch });

    return (
        <Sheet
            title="Bad-Aufgabe"
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
                value={item.label}
                onChange={e => set({ label: e.target.value })}
                placeholder="Bezeichnung (z.B. Zähne putzen)"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
            />

            <div>
                <span className="text-xs font-semibold text-slate-500">Kind</span>
                <div className="grid grid-cols-2 gap-2 mt-1">
                    {kids.map(k => (
                        <button
                            key={k.id}
                            onClick={() => set({ assignedTo: k.id })}
                            className={`px-3 py-2 rounded-lg border flex items-center gap-2 text-sm ${
                                item.assignedTo === k.id
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
                <span className="text-xs font-semibold text-slate-500">Zeitfenster</span>
                <div className="grid grid-cols-3 gap-2 mt-1">
                    {SLOTS.map(s => (
                        <button
                            key={s.id}
                            onClick={() => set({ timeSlot: s.id })}
                            className={`px-3 py-2 rounded-lg border text-sm ${
                                item.timeSlot === s.id
                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-slate-200 dark:border-slate-700'
                            }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <span className="text-xs font-semibold text-slate-500">Sterne-Verknüpfung (optional)</span>
                <select
                    value={item.linkedChoreId || ''}
                    onChange={e => set({ linkedChoreId: e.target.value || undefined })}
                    className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2"
                >
                    <option value="">— Keine Sterne —</option>
                    {chores.map(c => (
                        <option key={c.id} value={c.id}>
                            {c.label} ({'★'.repeat(c.difficulty || 1)})
                        </option>
                    ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                    Verknüpfte Aufgaben vergeben Sterne automatisch — einmal pro Zeitfenster.
                </p>
            </div>

            <div>
                <span className="text-xs font-semibold text-slate-500">Symbol</span>
                <div className="grid grid-cols-6 gap-2 mt-1">
                    {ICON_KEYS.map(k => (
                        <button
                            key={k}
                            onClick={() => set({ icon: k })}
                            className={`aspect-square flex items-center justify-center rounded-lg border ${
                                item.icon === k
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
