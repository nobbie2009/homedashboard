import React, { useEffect, useState } from 'react';


export const RainRadarWidget: React.FC = () => {
    // Use DWD Radar (Germany) as robust fallback for Raspberry Pi
    const dwdUrl = "https://www.dwd.de/DWD/wetter/radar/radfilm_brd_akt.gif";

    // Add timestamp to prevent caching issues
    const [radarUrl, setRadarUrl] = useState(`${dwdUrl}?t=${Date.now()}`);

    useEffect(() => {
        const timer = setInterval(() => {
            setRadarUrl(`${dwdUrl}?t=${Date.now()}`);
        }, 5 * 60 * 1000); // Refresh every 5 minutes
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="h-full w-full bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden relative flex flex-col">
            <div className="flex-1 relative overflow-hidden bg-black">
                {/* Display DWD Gif - Object Fit Contain to see whole map */}
                <img
                    src={radarUrl}
                    alt="Regenradar Deutschland"
                    className="w-full h-full object-contain opacity-90"
                />
            </div>

            {/* Title Overlay */}
            <div className="absolute top-0 left-0 bg-slate-900/50 px-2 py-1 rounded-br-lg pointer-events-none z-10 backdrop-blur-sm">
                <span className="text-white text-xs font-semibold">Regenradar (DWD)</span>
            </div>
        </div>
    );
};
