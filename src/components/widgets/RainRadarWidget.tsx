import React, { useEffect, useState } from 'react';
import { useConfig } from '../../contexts/ConfigContext';

export const RainRadarWidget: React.FC = () => {
    const { config } = useConfig();
    const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);

    useEffect(() => {
        const fetchCoords = async () => {
            if (!config.weatherLocation) return;
            try {
                const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(config.weatherLocation)}&count=1&language=de&format=json`);
                const data = await res.json();
                if (data.results?.[0]) {
                    setCoords({ lat: data.results[0].latitude, lon: data.results[0].longitude });
                }
            } catch (error) {
                console.error("Geocoding failed", error);
            }
        };
        fetchCoords();
    }, [config.weatherLocation]);

    // Default to Germany Center if no location found yet
    const loc = coords ? `${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}` : '51.1657,10.4515';
    const zoom = coords ? 8 : 6;

    return (
        <div className="h-full w-full bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden relative">
            <iframe
                src={`https://www.rainviewer.com/map.html?loc=${loc},${zoom}&layer=radar&oAP=0&color=2&opacity=90`}
                className="w-full h-full border-0"
                loading="eager"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                allowFullScreen
            />

            {/* Title Overlay */}
            <div className="absolute top-0 left-0 bg-slate-900/50 px-2 py-1 rounded-br-lg pointer-events-none z-10">
                <span className="text-white text-xs font-semibold">Regenradar</span>
            </div>

            {/* Center Marker (Red Dot) */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10 drop-shadow-md">
                <span className="relative flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-600 border-2 border-white"></span>
                </span>
            </div>
        </div>
    );
};
