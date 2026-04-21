import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSecurity } from '../../contexts/SecurityContext';
import { getApiUrl } from '../../utils/api';
import { Wrench, Undo2 } from 'lucide-react';
import { TaskCard } from './TaskCard';
import { MemberPicker } from './MemberPicker';
import type { HouseholdStateResponse, CompleteResponse } from './types';
import type { HouseholdTask } from '../../contexts/ConfigContext';

const UNDO_MS = 30_000;

const HouseholdView: React.FC = () => {
    const { deviceId } = useSecurity();
    const API_URL = getApiUrl();
    const [data, setData] = useState<HouseholdStateResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [picker, setPicker] = useState<HouseholdTask | null>(null);
    const [undo, setUndo] = useState<{ taskId: string; completedAt: number } | null>(null);
    const [undoRemainingMs, setUndoRemainingMs] = useState(0);
    const undoTimer = useRef<number | null>(null);

    const fetchTasks = useCallback(async () => {
        if (!deviceId) return;
        try {
            const res = await fetch(`${API_URL}/api/household/tasks`, {
                headers: { 'x-device-id': deviceId }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const j: HouseholdStateResponse = await res.json();
            setData(j);
            setError(null);
        } catch {
            setError('Keine Verbindung');
        }
    }, [API_URL, deviceId]);

    useEffect(() => { fetchTasks(); }, [fetchTasks]);

    useEffect(() => {
        if (!undo) {
            if (undoTimer.current) window.clearInterval(undoTimer.current);
            return;
        }
        const tick = () => {
            const remaining = UNDO_MS - (Date.now() - undo.completedAt);
            if (remaining <= 0) { setUndo(null); setUndoRemainingMs(0); return; }
            setUndoRemainingMs(remaining);
        };
        tick();
        const id = window.setInterval(tick, 250);
        undoTimer.current = id;
        return () => window.clearInterval(id);
    }, [undo]);

    const doComplete = async (task: HouseholdTask, memberId?: string) => {
        try {
            const res = await fetch(`${API_URL}/api/household/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({ taskId: task.id, memberId })
            });
            if (!res.ok) { setError('Fehler'); return; }
            const j: CompleteResponse = await res.json();
            setUndo({ taskId: task.id, completedAt: j.completedAt });
            await fetchTasks();
        } catch {
            setError('Verbindungsfehler');
        }
    };

    const onCardClick = (task: HouseholdTask) => {
        const members = data?.members || [];
        if (members.length <= 1) {
            doComplete(task, members[0]?.id);
        } else {
            setPicker(task);
        }
    };

    const onPickerPick = (memberId: string) => {
        if (!picker) return;
        const task = picker;
        setPicker(null);
        doComplete(task, memberId);
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

    if (!data) {
        return (
            <div className="h-full w-full flex items-center justify-center text-slate-500">
                {error || 'Lädt...'}
            </div>
        );
    }

    const memberById = new Map(data.members.map(m => [m.id, m]));

    return (
        <div className="h-full w-full p-6 bg-white dark:bg-slate-900 overflow-y-auto relative">
            <header className="mb-6 flex items-center gap-3">
                <Wrench className="w-7 h-7 text-blue-500" />
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Haushalt</h1>
            </header>

            {data.tasks.length === 0 ? (
                <div className="text-center text-slate-500 dark:text-slate-400 py-16">
                    <p className="text-lg">Keine Aufgaben konfiguriert</p>
                    <p className="text-sm">Im Admin unter „Haushalt" anlegen.</p>
                </div>
            ) : (
                <div className="space-y-3 max-w-3xl">
                    {data.tasks.map(t => (
                        <TaskCard
                            key={t.id}
                            task={t}
                            member={t.assignedTo ? memberById.get(t.assignedTo) : undefined}
                            lastMember={t.lastCompletedBy ? memberById.get(t.lastCompletedBy) : undefined}
                            now={data.now}
                            onComplete={() => onCardClick(t)}
                        />
                    ))}
                </div>
            )}

            {picker && <MemberPicker members={data.members} onPick={onPickerPick} onCancel={() => setPicker(null)} />}

            {undo && (
                <div className="fixed bottom-24 inset-x-0 flex justify-center pointer-events-none z-40">
                    <button
                        onClick={doUndo}
                        className="pointer-events-auto bg-slate-800 text-white px-5 py-3 rounded-full shadow-lg flex items-center gap-2 border border-slate-700"
                    >
                        <Undo2 className="w-5 h-5" />
                        <span className="font-semibold">Rückgängig</span>
                        <span className="text-slate-400 text-sm tabular-nums">{Math.ceil(undoRemainingMs / 1000)}s</span>
                    </button>
                </div>
            )}

            {error && (
                <div className="fixed top-20 inset-x-0 flex justify-center">
                    <div className="bg-red-900/80 text-red-100 px-4 py-1 rounded text-sm">{error}</div>
                </div>
            )}
        </div>
    );
};

export default HouseholdView;
