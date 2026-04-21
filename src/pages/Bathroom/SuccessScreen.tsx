import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { BathroomStateResponse } from './types';

interface Props {
    window: 'morning' | 'evening';
    items: BathroomStateResponse['items'];
}

export const SuccessScreen: React.FC<Props> = ({ window, items }) => {
    const label = window === 'morning' ? 'Morgen-Routine' : 'Abend-Routine';
    return (
        <div className="h-screen w-screen bg-slate-950 text-white flex flex-col items-center justify-center px-6 text-center">
            <CheckCircle2 className="w-24 h-24 text-green-400 mb-4" />
            <div className="text-3xl font-bold">Super, alles erledigt!</div>
            <div className="text-base text-slate-400 mt-2">{label} abgeschlossen</div>
            <ul className="mt-6 text-sm text-slate-300 space-y-1 max-h-32 overflow-y-auto">
                {items.map(i => (
                    <li key={i.id}>✓ {i.label}</li>
                ))}
            </ul>
        </div>
    );
};
