import React, { useEffect, useRef, useState } from 'react';
import { X, Save, Trash2, Keyboard } from 'lucide-react';
import { getApiUrl } from '../../utils/api';
import { useSecurity } from '../../contexts/SecurityContext';
import { OnScreenKeyboard } from './OnScreenKeyboard';

interface Props {
    initialText: string;
    onClose: () => void;
    onSaved?: (text: string) => void;
}

export const NoteEditorOverlay: React.FC<Props> = ({ initialText, onClose, onSaved }) => {
    const { deviceId } = useSecurity();
    const [text, setText] = useState(initialText);
    const [keyboardOpen, setKeyboardOpen] = useState(true);
    const [saving, setSaving] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-focus textarea so the OnScreenKeyboard targets it
    useEffect(() => {
        const id = setTimeout(() => textareaRef.current?.focus(), 50);
        return () => clearTimeout(id);
    }, []);

    const save = async (newText: string) => {
        setSaving(true);
        try {
            const res = await fetch(`${getApiUrl()}/api/note`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({ text: newText })
            });
            if (res.ok) {
                onSaved?.(newText);
                onClose();
            }
        } catch (e) {
            console.error('Save note failed', e);
        } finally {
            setSaving(false);
        }
    };

    const clear = async () => {
        await save('');
    };

    return (
        <div className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-start justify-center p-6">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-300 dark:border-slate-700 overflow-hidden mt-4">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                        Familien-Notiz bearbeiten
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                        title="Schließen ohne Speichern"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="p-6">
                    <textarea
                        ref={textareaRef}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onFocus={() => setKeyboardOpen(true)}
                        placeholder="Z.B. 'Bitte denk an den Elternabend um 19:00'"
                        rows={4}
                        className="w-full text-xl p-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border-2 border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:outline-none resize-none"
                    />
                    <div className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                        {text.length} Zeichen
                    </div>
                </div>

                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 gap-2">
                    <button
                        onClick={clear}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 disabled:opacity-50"
                    >
                        <Trash2 className="w-5 h-5" />
                        Notiz löschen
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                setKeyboardOpen(true);
                                textareaRef.current?.focus();
                            }}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
                            title="Bildschirmtastatur einblenden"
                        >
                            <Keyboard className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => save(text)}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg disabled:opacity-50"
                        >
                            <Save className="w-5 h-5" />
                            Speichern
                        </button>
                    </div>
                </div>
            </div>

            {keyboardOpen && <OnScreenKeyboard onClose={() => setKeyboardOpen(false)} />}
        </div>
    );
};
