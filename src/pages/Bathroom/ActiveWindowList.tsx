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

    // Group items by kid so we can render one column per child.
    // Kids without any items in this window are omitted to avoid empty columns.
    const itemsByKid = state.kids
        .map(kid => ({
            kid,
            items: state.items.filter(i => i.assignedTo === kid.id),
        }))
        .filter(group => group.items.length > 0);

    const unassigned = state.items.filter(i => !kidMap.has(i.assignedTo));
    if (unassigned.length > 0) {
        itemsByKid.push({
            kid: { id: '__unassigned', name: 'Sonstiges', color: '#94a3b8' } as (typeof state.kids)[number],
            items: unassigned,
        });
    }

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
                <div className={`grid gap-x-px bg-slate-800 ${
                    itemsByKid.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'
                }`}>
                    {itemsByKid.map(({ kid, items }) => {
                        const kidDone = items.filter(i => state.completed[i.id]).length;
                        return (
                            <div key={kid.id} className="flex flex-col bg-slate-900">
                                <div
                                    className="flex-none h-12 px-3 flex items-center justify-between border-b-2"
                                    style={{ borderBottomColor: kid.color, backgroundColor: `${kid.color}22` }}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span
                                            className="w-3 h-3 rounded-full flex-none"
                                            style={{ backgroundColor: kid.color }}
                                        />
                                        <span className="font-bold text-lg truncate">{kid.name}</span>
                                    </div>
                                    <span className="text-sm text-slate-400 tabular-nums flex-none">
                                        {kidDone}/{items.length}
                                    </span>
                                </div>
                                {items.map(item => {
                                    const done = !!state.completed[item.id];
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => handleTap(item)}
                                            className={`w-full h-14 px-3 flex items-center gap-2 border-b border-slate-800 active:bg-slate-800 transition ${
                                                done ? 'opacity-50' : 'bg-slate-900'
                                            }`}
                                        >
                                            <ChoreIcon icon={item.icon} className="w-6 h-6 text-white flex-none" />
                                            <span className={`text-base font-semibold flex-1 text-left truncate ${done ? 'line-through' : ''}`}>
                                                {item.label}
                                            </span>
                                            {done && <Check className="w-6 h-6 text-green-400 flex-none" />}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
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
