import React, { useEffect, useState } from 'react';
import { Pencil, Plus, StickyNote } from 'lucide-react';
import { getApiUrl } from '../../utils/api';
import { useSecurity } from '../../contexts/SecurityContext';
import { NoteEditorOverlay } from '../overlays/NoteEditorOverlay';

interface NoteState {
    text: string;
    updatedAt: number;
    author?: string;
}

export const NoteBanner: React.FC = () => {
    const { deviceId } = useSecurity();
    const [note, setNote] = useState<NoteState | null>(null);
    const [editing, setEditing] = useState(false);

    const fetchNote = async () => {
        if (!deviceId) return;
        try {
            const res = await fetch(`${getApiUrl()}/api/note`, {
                headers: { 'x-device-id': deviceId }
            });
            if (res.ok) {
                const data = await res.json();
                setNote(data);
            }
        } catch (e) {
            console.error('Note fetch failed', e);
        }
    };

    useEffect(() => {
        fetchNote();
        // Poll once per minute as a fallback; SSE is the primary path below.
        const t = setInterval(fetchNote, 60 * 1000);
        return () => clearInterval(t);
    }, [deviceId]);

    useEffect(() => {
        const src = new EventSource(`${getApiUrl()}/api/stream/events`);
        src.addEventListener('note', (e: MessageEvent) => {
            try {
                setNote(JSON.parse(e.data));
            } catch {}
        });
        src.onerror = () => src.close();
        return () => src.close();
    }, []);

    const hasNote = !!note?.text?.trim();

    return (
        <>
            {hasNote ? (
                <button
                    onClick={() => setEditing(true)}
                    className="group flex items-center gap-2 max-w-[40vw] bg-yellow-300/90 hover:bg-yellow-300 dark:bg-yellow-400/90 dark:hover:bg-yellow-400 text-slate-900 px-3 py-1.5 rounded-full shadow-md border border-yellow-500/60 transition-all"
                    title="Notiz bearbeiten"
                >
                    <StickyNote className="w-4 h-4 flex-shrink-0" />
                    <span className="text-sm font-semibold truncate">
                        {note!.text}
                    </span>
                    <Pencil className="w-3 h-3 opacity-60 group-hover:opacity-100 flex-shrink-0" />
                </button>
            ) : (
                <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2 py-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800"
                    title="Notiz anlegen"
                >
                    <Plus className="w-4 h-4" />
                    Notiz
                </button>
            )}

            {editing && (
                <NoteEditorOverlay
                    initialText={note?.text || ''}
                    onClose={() => setEditing(false)}
                    onSaved={(text) => setNote({ text, updatedAt: Date.now() })}
                />
            )}
        </>
    );
};
