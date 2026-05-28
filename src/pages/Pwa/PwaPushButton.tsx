import React, { useState } from 'react';
import { Bell, BellRing, Send } from 'lucide-react';
import { Sheet } from './Sheet';
import { usePush } from '../../hooks/usePush';

export const PwaPushButton: React.FC = () => {
    const { supported, subscribed, busy, permission, subscribe, unsubscribe, sendTest } = usePush();
    const [open, setOpen] = useState(false);

    if (!supported) return null;

    const blocked = permission === 'denied';

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                aria-label="Benachrichtigungen"
                className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 active:scale-95"
            >
                {subscribed ? <BellRing className="w-5 h-5 text-blue-500" /> : <Bell className="w-5 h-5" />}
            </button>

            {open && (
                <Sheet
                    title="Benachrichtigungen"
                    onClose={() => !busy && setOpen(false)}
                    footer={
                        <>
                            {subscribed && (
                                <button
                                    onClick={sendTest}
                                    disabled={busy}
                                    className="flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                                >
                                    <Send className="w-4 h-4" /> Test
                                </button>
                            )}
                            <div className="flex-1" />
                            {subscribed ? (
                                <button
                                    onClick={unsubscribe}
                                    disabled={busy}
                                    className="px-4 py-2 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-semibold disabled:opacity-40"
                                >
                                    {busy ? '…' : 'Deaktivieren'}
                                </button>
                            ) : (
                                <button
                                    onClick={subscribe}
                                    disabled={busy || blocked}
                                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold disabled:opacity-40"
                                >
                                    {busy ? 'Aktiviere…' : 'Aktivieren'}
                                </button>
                            )}
                        </>
                    }
                >
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Erhalte Push-Benachrichtigungen auf diesem Gerät – z.B. wenn es an der
                        Tür klingelt.
                    </p>
                    {blocked && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 rounded-lg p-3 text-sm">
                            Benachrichtigungen sind im Browser blockiert. Bitte in den
                            Website-Einstellungen erlauben und erneut versuchen.
                        </div>
                    )}
                    {subscribed && !blocked && (
                        <div className="text-sm text-green-600 dark:text-green-400 font-semibold">
                            Aktiviert auf diesem Gerät.
                        </div>
                    )}
                </Sheet>
            )}
        </>
    );
};
