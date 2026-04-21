import React from 'react';
import type { HouseholdMember } from '../../contexts/ConfigContext';

interface Props {
    members: HouseholdMember[];
    onPick: (id: string) => void;
    onCancel: () => void;
}

export const MemberPicker: React.FC<Props> = ({ members, onPick, onCancel }) => (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onCancel}>
        <div
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4 border border-slate-200 dark:border-slate-700"
            onClick={e => e.stopPropagation()}
        >
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Wer hat es erledigt?</h3>
            <div className="grid grid-cols-2 gap-3">
                {members.map(m => (
                    <button
                        key={m.id}
                        onClick={() => onPick(m.id)}
                        className="flex items-center gap-2 px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                        <span className="w-4 h-4 rounded-full" style={{ backgroundColor: m.color }} />
                        <span className="font-semibold text-slate-900 dark:text-white">{m.name}</span>
                    </button>
                ))}
            </div>
            <button
                onClick={onCancel}
                className="mt-4 w-full px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
                Abbrechen
            </button>
        </div>
    </div>
);
