import React, { useEffect, useState } from 'react';
import { StickyNote, Pencil, Plus, Trash2, Save } from 'lucide-react';
import { getApiUrl } from '../../utils/api';
import { useSecurity } from '../../contexts/SecurityContext';
import { Sheet } from './Sheet';

interface NoteState {
    text: string;
    updatedAt: number;
    author?: string;
}

export const PwaNoteButton: React.FC = () => {
    const { deviceId } = useSecurity();
    const API_URL = getApiUrl();

    const [note, setNote] = useState<NoteState | null>(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!deviceId) return;
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch(`${API_URL}/api/note`, {
                    headers: { 'x-device-id': deviceId }
                });
                if (res.ok && !cancelled) {
                    setNote(await res.json());
                }
            } catch (e) {
                console.error('Note fetch failed', e);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [API_URL, deviceId]);

    useEffect(() => {
        const src = new EventSource(`${API_URL}/api/stream/events`);
        src.addEventListener('note', (e: MessageEvent) => {
            try {
                setNote(JSON.parse(e.data));
            } catch {}
        });
        src.onerror = () => src.close();
        return () => src.close();
    }, [API_URL]);

    const open = () => {
        setDraft(note?.text || '');
        setEditing(true);
    };

    const persist = async (text: string) => {
        setBusy(true);
        try {
            const res = await fetch(`${API_URL}/api/note`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({ text })
            });
            if (res.ok) {
                const data = await res.json();
                setNote(data.note || { text, updatedAt: Date.now() });
                setEditing(false);
            }
        } catch (e) {
            console.error('Save note failed', e);
        } finally {
            setBusy(false);
        }
    };

    const hasNote = !!note?.text?.trim();

    return (
        <>
            {hasNote ? (
                <button
                    onClick={open}
                    className="flex items-center gap-1.5 max-w-[55vw] bg-yellow-300 text-slate-900 px-2.5 py-1 rounded-full shadow-sm border border-yellow-500/60 active:scale-95"
                    title="Notiz bearbeiten"
                >
                    <StickyNote className="w-3.5 h-3.5 flex-none" />
                    <span className="text-xs font-semibold truncate">{note!.text}</span>
                    <Pencil className="w-3 h-3 opacity-70 flex-none" />
                </button>
            ) : (
                <button
                    onClick={open}
                    className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-1 rounded-full border border-dashed border-slate-300 dark:border-slate-700 active:scale-95"
                    title="Notiz anlegen"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Notiz
                </button>
            )}

            {editing && (
                <Sheet
                    title="Familien-Notiz"
                    onClose={() => !busy && setEditing(false)}
                    footer={
                        <>
                            <button
                                onClick={() => persist('')}
                                disabled={busy || !hasNote}
                                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 disabled:opacity-40"
                            >
                                <Trash2 className="w-4 h-4" />
                                Löschen
                            </button>
                            <div className="flex-1" />
                            <button
                                onClick={() => setEditing(false)}
                                disabled={busy}
                                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                            >
                                Abbrechen
                            </button>
                            <button
                                onClick={() => persist(draft)}
                                disabled={busy}
                                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold disabled:opacity-40"
                            >
                                <Save className="w-4 h-4" />
                                {busy ? 'Speichere…' : 'Speichern'}
                            </button>
                        </>
                    }
                >
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                        Diese Notiz erscheint auf dem Dashboard und im Screensaver.
                    </div>
                    <textarea
                        autoFocus
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        placeholder="Z.B. 'Bitte denk an den Elternabend um 19:00'"
                        rows={5}
                        className="w-full text-base p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 focus:border-blue-500 focus:outline-none resize-none"
                    />
                    <div className="text-[11px] text-slate-400">
                        {draft.length} Zeichen
                        {note?.updatedAt ? ` · zuletzt aktualisiert ${new Date(note.updatedAt).toLocaleString('de-DE')}` : ''}
                    </div>
                </Sheet>
            )}
        </>
    );
};
