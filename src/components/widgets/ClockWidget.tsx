import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export const ClockWidget: React.FC = () => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="flex flex-col items-center justify-center p-4 bg-slate-800/50 rounded-xl backdrop-blur-sm shadow-lg w-full h-full border border-slate-700">
            <div className="text-6xl font-bold tabular-nums tracking-tight text-white">
                {format(time, 'HH:mm')}
            </div>
            <div className="text-xl text-slate-400 mt-2 font-medium">
                {format(time, 'EEEE, d. MMMM', { locale: de })}
            </div>
        </div>
    );
};
