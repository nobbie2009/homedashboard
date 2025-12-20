import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
// import { Plus } from 'lucide-react'; // Disable add button for now
// import { useKiosk } from '../../contexts/KioskContext';
import { useConfig } from '../../contexts/ConfigContext';
import { getApiUrl } from '../../utils/api';

// Reusing Note interface, or defining it locally
export interface Note {
    id: string;
    content: string;
    description?: string;
    author: string;
    createdAt: Date;
    targetDate?: Date;
    color: string;
}

const NoteCard = ({ note }: { note: Note }) => {
    const description = note.description || '';
    const truncatedDescription = description.length > 200
        ? description.slice(0, 200) + '...'
        : description;

    // Use targetDate if available, otherwise fallback to createdAt (though backend logic handles fallback too)
    const displayDate = note.targetDate || note.createdAt;

    return (
        <div className={clsx(
            "p-6 rounded-xl shadow-lg transform rotate-1 transition hover:rotate-0 hover:scale-105 duration-200 flex flex-col justify-between min-h-[200px]",
            note.color
        )}>
            <div>
                <div className="text-lg font-medium leading-relaxed whitespace-pre-wrap font-sans text-slate-800">
                    {note.content}
                </div>
                {truncatedDescription && (
                    <div className="mt-2 text-sm italic text-slate-600 font-serif leading-snug">
                        {truncatedDescription}
                    </div>
                )}
            </div>
            <div className="flex justify-between items-end mt-4 text-sm opacity-75 font-semibold text-slate-700">
                <span>{note.author}</span>
                <span>{displayDate ? format(new Date(displayDate), 'dd.MM.') : ''}</span>
            </div>
        </div>
    );
};

const NotesBoard: React.FC = () => {
    // const { isLocked } = useKiosk(); // Unused for now
    const { config } = useConfig();
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const API_URL = getApiUrl();

    const fetchNotes = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_URL}/api/notion/notes`);

            if (!response.ok) {
                let errorMessage = `HTTP error! Status: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorData.message || response.statusText || errorMessage;
                } catch (jsonError) {
                    // If response is not JSON, use statusText or default message
                    errorMessage = response.statusText || errorMessage;
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            setNotes(data);
            setError('');
        } catch (err: any) {
            console.error("Failed to load notes:", err);
            setError(`Fehler: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchNotes();
        // Poll based on config or default to 5 minutes
        const intervalTime = (config.notionRefreshInterval || 5) * 60 * 1000;
        const interval = setInterval(fetchNotes, intervalTime);
        return () => clearInterval(interval);
    }, [config.notionRefreshInterval]);

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-6 pl-2">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                    Familien-Board
                </h2>
                {/* 
                {!isLocked && (
                    <button className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition">
                        <Plus className="w-5 h-5" />
                        <span>Notiz erstellen</span>
                    </button>
                )}
                */}
            </div>

            <div className="flex-1 overflow-y-auto pb-20 custom-scrollbar">
                {loading && notes.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-slate-400">
                        Lade Notizen aus Notion...
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-40 text-red-400 space-y-2">
                        <span>{error}</span>
                        <button onClick={fetchNotes} className="bg-slate-800 px-4 py-2 rounded hover:bg-slate-700 text-white">
                            Erneut versuchen
                        </button>
                    </div>
                ) : notes.length === 0 ? (
                    <div className="flex items-center justify-center h-40 text-slate-500">
                        Keine Notizen gefunden (Filter: Private?)
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-4">
                        {notes.map(note => (
                            <NoteCard key={note.id} note={note} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotesBoard;
