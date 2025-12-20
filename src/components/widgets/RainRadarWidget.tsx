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
    const loc = coords ? `${coords.lat},${coords.lon}` : '51.1657,10.4515';
    const zoom = coords ? 8 : 6;

    return (
        <div className="h-full w-full bg-slate-800/60 rounded-xl backdrop-blur-md shadow-lg border border-slate-700 overflow-hidden relative">
            <iframe
                src={`https://www.rainviewer.com/map.html?loc=${loc},${zoom}&oFa=0&oC=0&oU=0&oCS=1&oF=0&oAP=0&c=3&o=83&lm=1&layer=radar&sm=1&sn=1`}
                className="w-full h-full border-0"
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
