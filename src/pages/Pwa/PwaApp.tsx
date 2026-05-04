import React, { useState } from 'react';
import { Star, ClipboardCheck, Wrench, Trophy } from 'lucide-react';
import { PwaStars } from './PwaStars';
import { PwaChores } from './PwaChores';
import { PwaHousehold } from './PwaHousehold';

type Tab = 'sterne' | 'aufgaben' | 'haushalt';

const TABS: { id: Tab; label: string; icon: React.FC<any> }[] = [
    { id: 'sterne', label: 'Sterne', icon: Star },
    { id: 'aufgaben', label: 'Aufgaben', icon: ClipboardCheck },
    { id: 'haushalt', label: 'Haushalt', icon: Wrench },
];

const PwaApp: React.FC = () => {
    const [tab, setTab] = useState<Tab>('sterne');

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
            <header className="flex-none h-12 px-4 flex items-center justify-between bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                    <span className="font-bold tracking-wide">Familien-Manager</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">PWA</span>
            </header>

            <main className="flex-1 overflow-y-auto pb-24">
                {tab === 'sterne' && <PwaStars />}
                {tab === 'aufgaben' && <PwaChores />}
                {tab === 'haushalt' && <PwaHousehold />}
            </main>

            <nav className="fixed bottom-0 inset-x-0 h-20 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex">
                {TABS.map(t => {
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex-1 flex flex-col items-center justify-center gap-1 transition active:scale-95 ${
                                active
                                    ? 'text-blue-600 dark:text-blue-400 border-t-4 border-blue-600 dark:border-blue-400 bg-slate-100 dark:bg-slate-800'
                                    : 'text-slate-500 dark:text-slate-400'
                            }`}
                        >
                            <t.icon className="w-6 h-6" />
                            <span className="text-xs font-semibold">{t.label}</span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
};

export default PwaApp;
