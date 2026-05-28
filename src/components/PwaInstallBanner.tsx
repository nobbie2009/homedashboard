import { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';

const DISMISS_KEY = 'homedashboard_install_dismissed';

export function PwaInstallBanner() {
    const { canInstall, needsIosHint, promptInstall } = usePwaInstall();
    const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

    if (dismissed || (!canInstall && !needsIosHint)) return null;

    const close = () => {
        localStorage.setItem(DISMISS_KEY, '1');
        setDismissed(true);
    };

    return (
        <div className="mx-4 mt-3 rounded-xl border border-blue-300 dark:border-blue-700/50 bg-blue-50 dark:bg-blue-900/20 px-4 py-3 flex items-center gap-3">
            <Download className="w-5 h-5 flex-none text-blue-600 dark:text-blue-400" />
            <div className="flex-1 text-sm text-slate-700 dark:text-slate-200">
                {canInstall ? (
                    <span className="font-semibold">FamilyHub als App installieren</span>
                ) : (
                    <span>
                        Installieren: <Share className="inline w-4 h-4 -mt-0.5" /> „Teilen" →
                        {' '}„Zum Home-Bildschirm"
                    </span>
                )}
            </div>
            {canInstall && (
                <button
                    onClick={promptInstall}
                    className="flex-none rounded-lg bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 text-sm font-bold active:scale-95"
                >
                    Installieren
                </button>
            )}
            <button
                onClick={close}
                aria-label="Schließen"
                className="flex-none rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 active:scale-95"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
