import React, { useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
// import { de } from 'date-fns/locale';
import { mockEvents } from '../../services/mockData'; // Adjust path if needed

export const AgendaWidget: React.FC = () => {
    // In a real app, this would come from a Context or API hook
    const events = useMemo(() => {
        const today = new Date();
        return mockEvents
            .filter(e => isSameDay(e.start, today))
            .sort((a, b) => a.start.getTime() - b.start.getTime());
    }, []);

    return (
        <div className="flex flex-col p-4 bg-slate-800/50 rounded-xl backdrop-blur-sm shadow-lg w-full h-full border border-slate-700 overflow-hidden">
            <h3 className="text-lg font-semibold text-slate-300 mb-3 uppercase tracking-wider">Heute</h3>
            <div className="flex-1 overflow-y-auto space-y-3">
                {events.length === 0 ? (
                    <div className="text-slate-500 text-center mt-10">Keine Termine heute</div>
                ) : (
                    events.map(event => (
                        <div key={event.id} className="flex items-center p-3 bg-slate-700/50 rounded-lg border-l-4 border-l-transparent transition hover:bg-slate-700" style={{ borderLeftColor: event.color.replace('bg-', '') }}>
                            <div className="flex flex-col w-16 text-center border-r border-slate-600 pr-3 mr-3">
                                <span className="text-xl font-bold text-white">{format(event.start, 'HH:mm')}</span>
                                <span className="text-xs text-slate-400">{format(event.end, 'HH:mm')}</span>
                            </div>
                            <div className="flex-1">
                                <div className="text-white font-medium text-lg leading-tight">{event.title}</div>
                                <div className="text-xs text-slate-400 mt-1 uppercase">{event.calendarId}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
