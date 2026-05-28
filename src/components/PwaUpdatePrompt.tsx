import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

const UPDATE_CHECK_INTERVAL = 60 * 60 * 1000; // hourly

export function PwaUpdatePrompt() {
    const {
        offlineReady: [offlineReady, setOfflineReady],
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW({
        onRegisteredSW(_swUrl, registration) {
            if (!registration) return;
            // Let an unattended wall kiosk pick up new deploys without a manual reload.
            setInterval(() => registration.update().catch(() => {}), UPDATE_CHECK_INTERVAL);
        },
    });

    if (!needRefresh && !offlineReady) return null;

    const dismiss = () => {
        setNeedRefresh(false);
        setOfflineReady(false);
    };

    return (
        <div
            className="fixed left-1/2 -translate-x-1/2 z-[100] w-[min(92vw,28rem)]"
            style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
        >
            <div className="flex items-center gap-3 rounded-xl bg-slate-900 text-white shadow-2xl border border-slate-700 px-4 py-3">
                <RefreshCw className="w-5 h-5 flex-none text-blue-400" />
                <span className="flex-1 text-sm font-semibold">
                    {needRefresh ? 'Neue Version verfügbar' : 'App ist offline bereit'}
                </span>
                {needRefresh && (
                    <button
                        onClick={() => updateServiceWorker(true)}
                        className="flex-none rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-sm font-bold active:scale-95"
                    >
                        Neu laden
                    </button>
                )}
                <button
                    onClick={dismiss}
                    aria-label="Schließen"
                    className="flex-none rounded-lg p-1.5 text-slate-400 hover:text-white active:scale-95"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}
