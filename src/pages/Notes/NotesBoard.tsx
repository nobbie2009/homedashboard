import React from 'react';
import { mockNotes, Note } from '../../services/mockData';
import { format } from 'date-fns';
import clsx from 'clsx';
import { Plus } from 'lucide-react';
import { useKiosk } from '../../contexts/KioskContext';

const NoteCard = ({ note }: { note: Note }) => {
    return (
        <div className={clsx(
            "p-6 rounded-xl shadow-lg transform rotate-1 transition hover:rotate-0 hover:scale-105 duration-200 flex flex-col justify-between min-h-[200px]",
            note.color
        )}>
            <div className="text-lg font-medium leading-relaxed whitespace-pre-wrap font-sans">
                {note.content}
            </div>
            <div className="flex justify-between items-end mt-4 text-sm opacity-75 font-semibold">
                <span>{note.author}</span>
                <span>{format(note.createdAt, 'dd.MM.')}</span>
            </div>
        </div>
    );
};

const NotesBoard: React.FC = () => {
    const { isLocked } = useKiosk();

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-6 pl-2">
                <h2 className="text-3xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                    Familien-Board
                </h2>
                {!isLocked && (
                    <button className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition">
                        <Plus className="w-5 h-5" />
                        <span>Notiz erstellen</span>
                    </button>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-4 overflow-y-auto pb-20">
                {mockNotes.map(note => (
                    <NoteCard key={note.id} note={note} />
                ))}

                {/* Add Note Placeholder if unlocked */}
                {!isLocked && (
                    <div className="border-2 border-dashed border-slate-700 rounded-xl flex items-center justify-center min-h-[200px] text-slate-500 hover:text-slate-300 hover:border-slate-500 cursor-pointer transition">
                        <div className="flex flex-col items-center">
                            <Plus className="w-12 h-12 mb-2" />
                            <span className="font-medium">Neue Notiz</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotesBoard;
