import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface SheetProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

/**
 * Mobile-friendly modal sheet.
 *
 * Centered vertically (rather than pinned to the bottom) so iOS Safari can
 * push the sheet up when the on-screen keyboard appears, keeping the focused
 * input visible. Uses 100dvh + safe-area-inset padding so nothing is hidden
 * behind the dynamic toolbar / home indicator.
 */
export const Sheet: React.FC<SheetProps> = ({ title, onClose, children, footer }) => {
    // Lock background scroll while the sheet is open
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    return (
        <div
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3"
            onClick={onClose}
            style={{
                paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)'
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
                style={{ maxHeight: '85dvh' }}
            >
                <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-bold">{title}</h3>
                    <button onClick={onClose} className="p-1.5 -mr-1 text-slate-400 hover:text-slate-700 dark:hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                    {children}
                </div>
                {footer && (
                    <div className="flex-none px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex gap-2 items-center">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};
