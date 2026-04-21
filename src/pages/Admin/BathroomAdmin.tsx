import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useConfig } from '../../contexts/ConfigContext';
import { useSecurity } from '../../contexts/SecurityContext';
import { getApiUrl } from '../../utils/api';
import type { BathroomItem, BathroomSchedule } from '../../contexts/ConfigContext';
import { Plus, Trash2, RotateCcw, Info } from 'lucide-react';

const DEFAULT_SCHEDULE: BathroomSchedule = {
    morningStart: '06:00', morningEnd: '10:00',
    eveningStart: '18:00', eveningEnd: '22:00'
};

export const BathroomAdmin: React.FC = () => {
    const { config, updateConfig } = useConfig();
    const { deviceId } = useSecurity();
    const API_URL = getApiUrl();

    const bathroom = config.bathroom || { items: [], schedule: DEFAULT_SCHEDULE };
    const kids = config.chores?.kids || [];
    const chores = config.chores?.tasks || [];
    const [scheduleDraft, setScheduleDraft] = useState<BathroomSchedule>(bathroom.schedule);
    const [scheduleError, setScheduleError] = useState('');
    const [scheduleSaved, setScheduleSaved] = useState(false);
    const [resetPin, setResetPin] = useState('');
    const [resetMsg, setResetMsg] = useState('');

    const validateSchedule = (s: BathroomSchedule): string | null => {
        const re = /^([01]\d|2[0-3]):[0-5]\d$/;
        const keys = ['morningStart', 'morningEnd', 'eveningStart', 'eveningEnd'] as const;
        for (const k of keys) {
            if (!re.test(s[k])) return `Ungültige Uhrzeit bei ${k}`;
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
        if (err) { setScheduleError(err); setScheduleSaved(false); return; }
        setScheduleError('');
        updateConfig({ bathroom: { ...bathroom, schedule: scheduleDraft } });
        setScheduleSaved(true);
        setTimeout(() => setScheduleSaved(false), 2000);
    };

    const addItem = () => {
        const newItem: BathroomItem = {
            id: uuidv4(),
            label: 'Neue Aufgabe',
            icon: 'Check',
            assignedTo: kids[0]?.id || '',
            timeSlot: 'morning'
        };
        updateConfig({ bathroom: { ...bathroom, items: [...bathroom.items, newItem] } });
    };

    const updateItem = (id: string, patch: Partial<BathroomItem>) => {
        const next = bathroom.items.map(i => i.id === id ? { ...i, ...patch } : i);
        updateConfig({ bathroom: { ...bathroom, items: next } });
    };

    const deleteItem = (id: string) => {
        updateConfig({ bathroom: { ...bathroom, items: bathroom.items.filter(i => i.id !== id) } });
    };

    const triggerReset = async () => {
        setResetMsg('');
        try {
            const res = await fetch(`${API_URL}/api/bathroom/reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({ pin: resetPin })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setResetMsg(data.error || 'Fehler');
            } else {
                setResetMsg('Zurückgesetzt');
                setResetPin('');
            }
        } catch {
            setResetMsg('Verbindungsfehler');
        }
    };

    return (
        <div className="space-y-8 text-slate-900 dark:text-white">
            {/* Schedule */}
            <section className="bg-slate-200/30 dark:bg-slate-800/30 p-6 rounded-xl border border-slate-300 dark:border-slate-700 space-y-3">
                <h3 className="text-lg font-bold">Zeitfenster</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {([
                        ['morningStart', 'Morgen-Start'],
                        ['morningEnd', 'Morgen-Ende'],
                        ['eveningStart', 'Abend-Start'],
                        ['eveningEnd', 'Abend-Ende']
                    ] as const).map(([k, lbl]) => (
                        <label key={k} className="flex flex-col text-sm">
                            <span className="text-slate-500 dark:text-slate-400">{lbl}</span>
                            <input
                                type="time"
                                value={scheduleDraft[k]}
                                onChange={e => setScheduleDraft({ ...scheduleDraft, [k]: e.target.value })}
                                className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-900 dark:text-white"
                            />
                        </label>
                    ))}
                </div>
                {scheduleError && <div className="text-red-500 dark:text-red-400 text-sm">{scheduleError}</div>}
                <div className="flex items-center gap-3">
                    <button onClick={saveSchedule} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded">
                        Zeitfenster speichern
                    </button>
                    {scheduleSaved && <span className="text-green-500 dark:text-green-400 text-sm">Gespeichert</span>}
                </div>
            </section>

            {/* Items */}
            <section className="bg-slate-200/30 dark:bg-slate-800/30 p-6 rounded-xl border border-slate-300 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Aufgaben</h3>
                    <button onClick={addItem} className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm">
                        <Plus className="w-4 h-4" /> Hinzufügen
                    </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    Aufgaben mit Sterne-Verknüpfung vergeben am Echo Sterne OHNE PIN, begrenzt auf einmal pro Zeitfenster.
                </p>
                <div className="space-y-2">
                    {bathroom.items.map(item => (
                        <div key={item.id} className="grid grid-cols-1 md:grid-cols-[1fr_8rem_6rem_8rem_12rem_2rem] gap-2 items-center bg-white dark:bg-slate-800 rounded p-2 border border-slate-200 dark:border-slate-700">
                            <input
                                value={item.label}
                                onChange={e => updateItem(item.id, { label: e.target.value })}
                                className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                placeholder="Bezeichnung"
                            />
                            <input
                                value={item.icon}
                                onChange={e => updateItem(item.id, { icon: e.target.value })}
                                className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                                placeholder="Icon (z.B. Brush)"
                            />
                            <select
                                value={item.timeSlot}
                                onChange={e => updateItem(item.id, { timeSlot: e.target.value as BathroomItem['timeSlot'] })}
                                className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                            >
                                <option value="morning">Morgens</option>
                                <option value="evening">Abends</option>
                                <option value="both">Beides</option>
                            </select>
                            <select
                                value={item.assignedTo}
                                onChange={e => updateItem(item.id, { assignedTo: e.target.value })}
                                className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                            >
                                <option value="">— Kind —</option>
                                {kids.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                            </select>
                            <select
                                value={item.linkedChoreId || ''}
                                onChange={e => updateItem(item.id, { linkedChoreId: e.target.value || undefined })}
                                className="bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                            >
                                <option value="">— Keine Sterne —</option>
                                {chores.map(c => (
                                    <option key={c.id} value={c.id}>{c.label} ({'★'.repeat(c.difficulty || 1)})</option>
                                ))}
                            </select>
                            <button
                                onClick={() => deleteItem(item.id)}
                                className="text-red-500 hover:text-red-400 p-2"
                                title="Löschen"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                    {bathroom.items.length === 0 && (
                        <div className="text-slate-500 italic text-sm">Keine Aufgaben konfiguriert.</div>
                    )}
                </div>
            </section>

            {/* Reset */}
            <section className="bg-slate-200/30 dark:bg-slate-800/30 p-6 rounded-xl border border-slate-300 dark:border-slate-700 space-y-3">
                <h3 className="text-lg font-bold">Aktuelles Zeitfenster zurücksetzen</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Setzt die erledigten Aufgaben im aktuellen Zeitfenster zurück. Bereits vergebene Sterne bleiben erhalten.
                </p>
                <div className="flex items-center gap-2">
                    <input
                        type="password"
                        value={resetPin}
                        onChange={e => setResetPin(e.target.value)}
                        placeholder="Admin-PIN"
                        className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-2 py-1"
                    />
                    <button onClick={triggerReset} className="flex items-center gap-1 bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded text-sm">
                        <RotateCcw className="w-4 h-4" /> Zurücksetzen
                    </button>
                    {resetMsg && <span className="text-sm text-slate-500 dark:text-slate-300">{resetMsg}</span>}
                </div>
            </section>
        </div>
    );
};

export default BathroomAdmin;
