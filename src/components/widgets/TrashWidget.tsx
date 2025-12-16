import React from 'react';
import { format, isToday, isTomorrow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Trash2 } from 'lucide-react';
import { mockTrash, TrashEvent } from '../../services/mockData';

const TrashIcon = ({ type }: { type: TrashEvent['type'] }) => {
    const colors = {
        bio: 'text-green-500',
        paper: 'text-blue-500',
        plastic: 'text-yellow-400',
        rest: 'text-slate-400'
    };
    return <Trash2 className={`w-8 h-8 ${colors[type]}`} />;
};

const getTrashColor = (type: TrashEvent['type']) => {
    switch (type) {
        case 'bio': return 'bg-green-500/20 border-green-500/50 text-green-100';
        case 'paper': return 'bg-blue-500/20 border-blue-500/50 text-blue-100';
        case 'plastic': return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-100';
        case 'rest': return 'bg-slate-500/20 border-slate-500/50 text-slate-200';
        default: return 'bg-slate-700 border-slate-600';
    }
};

export const TrashWidget: React.FC = () => {
    // Sort by date
    const events = [...mockTrash].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 3);

    return (
        <div className="flex flex-col p-4 bg-slate-800/50 rounded-xl backdrop-blur-sm shadow-lg w-full h-full border border-slate-700">
            <h3 className="text-lg font-semibold text-slate-300 mb-3 uppercase tracking-wider">Müllabfuhr</h3>
            <div className="space-y-2 flex-1">
                {events.map(event => {
                    let dateLabel = format(event.date, 'EEEE', { locale: de });
                    if (isToday(event.date)) dateLabel = 'Heute';
                    else if (isTomorrow(event.date)) dateLabel = 'Morgen';

                    return (
                        <div key={event.id} className={`flex items-center justify-between p-3 rounded-lg border ${getTrashColor(event.type)}`}>
                            <div className="flex items-center space-x-3">
                                <TrashIcon type={event.type} />
                                <span className="capitalize font-medium text-lg">{event.type}</span>
                            </div>
                            <span className="font-bold text-lg">{dateLabel}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
