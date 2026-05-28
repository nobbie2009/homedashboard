import React, { useState } from 'react';
import { Star, ClipboardCheck, Wrench, Trophy, Droplets, Sun, Moon, Clock, WifiOff } from 'lucide-react';
import { PwaStars } from './PwaStars';
import { PwaChores } from './PwaChores';
import { PwaHousehold } from './PwaHousehold';
import { PwaBath } from './PwaBath';
import { PwaNoteButton } from './PwaNoteButton';
import { useTheme } from '../../hooks/useTheme';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useConfig } from '../../contexts/ConfigContext';
import { PwaInstallBanner } from '../../components/PwaInstallBanner';
import { PullToRefresh } from '../../components/PullToRefresh';

type Tab = 'sterne' | 'aufgaben' | 'haushalt' | 'bad';

const TABS: { id: Tab; label: string; icon: React.FC<any> }[] = [
    { id: 'sterne', label: 'Sterne', icon: Star },
    { id: 'aufgaben', label: 'Aufgaben', icon: ClipboardCheck },
    { id: 'bad', label: 'Bad', icon: Droplets },
    { id: 'haushalt', label: 'Haushalt', icon: Wrench },
];

const TAB_IDS: Tab[] = ['sterne', 'aufgaben', 'bad', 'haushalt'];

function initialTab(): Tab {
    const t = new URLSearchParams(window.location.search).get('tab');
    return (TAB_IDS as string[]).includes(t || '') ? (t as Tab) : 'sterne';
}

const PwaApp: React.FC = () => {
    const [tab, setTab] = useState<Tab>(initialTab);
    const { isDark, theme, toggleTheme } = useTheme();
    const isOnline = useOnlineStatus();
    const { reloadConfig } = useConfig();
    const [refreshKey, setRefreshKey] = useState(0);

    const handleRefresh = async () => {
        await reloadConfig();
        // Remount the active tab so its own fetches (history, etc.) re-run.
        setRefreshKey(k => k + 1);
    };

    return (
        <div className="flex flex-col min-h-[100dvh] bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
            <header
                className="flex-none px-4 pb-2 flex items-center justify-between bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30"
                style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <Trophy className="w-5 h-5 text-yellow-400 flex-none" />
                    <span className="font-bold tracking-wide flex-none">Familien-Manager</span>
                </div>
                <div className="flex items-center gap-1">
                    <PwaNoteButton />
                    <button
                        onClick={toggleTheme}
                        aria-label="Design wechseln"
                        title={theme === 'auto' ? 'Automatisch' : isDark ? 'Dunkel' : 'Hell'}
                        className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 active:scale-95"
                    >
                        {theme === 'auto'
                            ? <Clock className="w-5 h-5" />
                            : isDark
                                ? <Sun className="w-5 h-5 text-yellow-400" />
                                : <Moon className="w-5 h-5" />}
                    </button>
                </div>
            </header>

            {!isOnline && (
                <div className="flex-none flex items-center justify-center gap-2 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs font-semibold py-1.5">
                    <WifiOff className="w-4 h-4" />
                    Offline – zeige zuletzt geladene Daten
                </div>
            )}

            <PullToRefresh
                onRefresh={handleRefresh}
                className="flex-1 overflow-y-auto"
                style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
            >
                <PwaInstallBanner />
                <div key={refreshKey}>
                    {tab === 'sterne' && <PwaStars />}
                    {tab === 'aufgaben' && <PwaChores />}
                    {tab === 'bad' && <PwaBath />}
                    {tab === 'haushalt' && <PwaHousehold />}
                </div>
            </PullToRefresh>

            <nav
                className="fixed bottom-0 inset-x-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex z-30"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                {TABS.map(t => {
                    const active = tab === t.id;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`flex-1 h-20 flex flex-col items-center justify-center gap-1 transition active:scale-95 ${
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
