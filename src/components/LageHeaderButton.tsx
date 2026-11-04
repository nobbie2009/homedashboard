import React from 'react';
import { createPortal } from 'react-dom';
import { ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { useLage, LEVEL_STYLES } from '../hooks/useLage';
import { LageWidget } from './widgets/LageWidget';

/**
 * Header-Button „LAGE x“ neben „Einkaufszettel“. Zeigt die aktuelle Stufe
 * farbig an und öffnet die vollständige Übersicht als wegklickbares Popup.
 */
export const LageHeaderButton: React.FC = () => {
    const { snapshot } = useLage();
    const [open, setOpen] = React.useState(false);

    React.useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    if (snapshot && snapshot.enabled === false) return null;

    const level = snapshot?.level;
    const st = level ? LEVEL_STYLES[level] : null;

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className={clsx(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors active:scale-95",
                    "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700",
                    level !== undefined && level <= 2 && "animate-pulse"
                )}
                title={snapshot?.label ? `Lage-Index: ${snapshot.label}` : 'Lage-Index'}
            >
                {st ? (
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: st.hex }} />
                ) : (
                    <ShieldAlert className="w-4 h-4" />
                )}
                <span className="whitespace-nowrap">{level ? `LAGE ${level}` : 'Lage'}</span>
            </button>

            {open && createPortal(
                <div
                    className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
                    onClick={() => setOpen(false)}
                >
                    <div className="w-full max-w-4xl h-[88vh]" onClick={e => e.stopPropagation()}>
                        <LageWidget onClose={() => setOpen(false)} />
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default LageHeaderButton;
