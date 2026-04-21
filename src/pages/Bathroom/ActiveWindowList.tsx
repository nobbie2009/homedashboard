import React, { useEffect, useRef, useState } from 'react';
import { Check, Sunrise, Moon, Undo2, AlertTriangle } from 'lucide-react';
import { ChoreIcon } from '../../components/ChoreIcon';
import type { BathroomStateResponse } from './types';

interface Props {
    state: BathroomStateResponse;
    onToggle: (itemId: string, action: 'complete' | 'uncomplete') => Promise<BathroomStateResponse | null>;
    error: string | null;
}

const UNDO_MS = 30_000;

function formatClock(d: Date) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const ActiveWindowList: React.FC<Props> = ({ state, onToggle, error }) => {
    const [clock, setClock] = useState(() => formatClock(new Date()));
    const [undo, setUndo] = useState<{ itemId: string; serverTimestamp: number } | null>(null);
    const [undoRemainingMs, setUndoRemainingMs] = useState(0);
    const undoTimer = useRef<number | null>(null);

    useEffect(() => {
        const id = setInterval(() => setClock(formatClock(new Date())), 10_000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (!undo) {
            if (undoTimer.current) window.clearInterval(undoTimer.current);
            return;
        }
        const tick = () => {
            const remaining = UNDO_MS - (Date.now() - undo.serverTimestamp);
            if (remaining <= 0) {
                setUndo(null);
                setUndoRemainingMs(0);
                return;
            }
            setUndoRemainingMs(remaining);
        };
        tick();
        const id = window.setInterval(tick, 250);
        undoTimer.current = id;
        return () => { window.clearInterval(id); };
    }, [undo]);

    const kidMap = new Map(state.kids.map(k => [k.id, k]));
    const isMorning = state.currentWindow === 'morning';
    const windowLabel = isMorning ? 'Morgen-Routine' : 'Abend-Routine';
    const WindowIcon = isMorning ? Sunrise : Moon;
    const doneCount = state.items.filter(i => state.completed[i.id]).length;

    const handleTap = async (item: (typeof state.items)[number]) => {
        const done = !!state.completed[item.id];
        if (done) {
            await onToggle(item.id, 'uncomplete');
            return;
        }
        const resp = await onToggle(item.id, 'complete');
        if (resp?.completedAt) {
            setUndo({ itemId: item.id, serverTimestamp: resp.completedAt });
        }
    };

    const handleUndoClick = async () => {
        if (!undo) return;
        await onToggle(undo.itemId, 'uncomplete');
        setUndo(null);
    };

    return (
        <div className="h-screen w-screen bg-slate-900 text-white overflow-hidden flex flex-col relative">
            <div className="flex-none h-10 px-4 flex items-center justify-between border-b border-slate-800 bg-slate-950">
                <div className="flex items-center gap-2 text-base">
                    <WindowIcon className="w-5 h-5 text-yellow-300" />
                    <span className="font-semibold">{windowLabel}</span>
                </div>
                <div className="flex items-center gap-4 text-base">
                    <span className="tabular-nums">{clock}</span>
                    <span className="text-slate-400">{doneCount} von {state.items.length}</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {state.items.map(item => {
                    const done = !!state.completed[item.id];
                    const kid = kidMap.get(item.assignedTo);
                    return (
                        <button
                            key={item.id}
                            onClick={() => handleTap(item)}
                            className={`w-full h-[88px] px-4 flex items-center gap-3 border-b border-slate-800 active:bg-slate-800 transition ${
                                done ? 'opacity-50' : 'bg-slate-900'
                            }`}
                        >
                            <span
                                className="w-4 h-4 rounded-full flex-none"
                                style={{ backgroundColor: kid?.color || '#94a3b8' }}
                                title={kid?.name || 'Unbekannt'}
                            />
                            <ChoreIcon icon={item.icon} className="w-8 h-8 text-white flex-none" />
                            <span className={`text-2xl font-bold flex-1 text-left ${done ? 'line-through' : ''}`}>
                                {item.label}
                            </span>
                            {done && <Check className="w-8 h-8 text-green-400 flex-none" />}
                        </button>
                    );
                })}
            </div>

            {undo && (
                <div className="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none">
                    <button
                        onClick={handleUndoClick}
                        className="pointer-events-auto bg-slate-800 text-white px-5 py-3 rounded-full shadow-lg flex items-center gap-2 border border-slate-700"
                    >
                        <Undo2 className="w-5 h-5" />
                        <span className="font-semibold">Rückgängig</span>
                        <span className="text-slate-400 text-sm tabular-nums">
                            {Math.ceil(undoRemainingMs / 1000)}s
                        </span>
                    </button>
                </div>
            )}

            {error && (
                <div className="absolute top-12 inset-x-0 flex justify-center">
                    <div className="bg-red-900/80 text-red-100 px-4 py-1 rounded flex items-center gap-2 text-sm">
                        <AlertTriangle className="w-4 h-4" /> {error}
                    </div>
                </div>
            )}
        </div>
    );
};
