import React, { useEffect, useState } from 'react';
import { useConfig } from '../../contexts/ConfigContext';


export const RainRadarWidget: React.FC = () => {
    // Use DWD Radar (Germany) as robust fallback for Raspberry Pi
    const dwdUrl = "https://www.dwd.de/DWD/wetter/radar/radfilm_brd_akt.gif";
    const { config } = useConfig();
    const [radarUrl, setRadarUrl] = useState(`${dwdUrl}?t=${Date.now()}`);
    const [zoomStyle, setZoomStyle] = useState<React.CSSProperties>({});

    const [markerPos, setMarkerPos] = useState<{ x: number, y: number } | null>(null);

    // 1. Refresh Timer for Image
    useEffect(() => {
        const timer = setInterval(() => {
            setRadarUrl(`${dwdUrl}?t=${Date.now()}`);
        }, 5 * 60 * 1000);
        return () => clearInterval(timer);
    }, []);

    // 2. Geocoding & Zoom Calculation
    useEffect(() => {
        const calculateZoom = async () => {
            if (!config.weatherLocation) return;

            try {
                // Fetch coordinates
                const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(config.weatherLocation)}&count=1&language=de&format=json`);
                const data = await res.json();

                if (data.results?.[0]) {
                    const { latitude, longitude } = data.results[0];

                    // DWD Radar Approximate Bounds (Germany)
                    // North: 55.1, South: 47.1, West: 5.7, East: 15.5
                    // Simplistic linear mapping
                    const north = 55.1;
                    const south = 47.1;
                    const west = 5.8;
                    const east = 15.1;

                    // Calculate percentages (0-100)
                    // limit to 0-100 to prevent zooming out of bounds
                    let xPercent = ((longitude - west) / (east - west)) * 100;
                    let yPercent = ((north - latitude) / (north - south)) * 100;

                    // Clamp
                    xPercent = Math.max(10, Math.min(90, xPercent));
                    yPercent = Math.max(10, Math.min(90, yPercent));

                    setMarkerPos({ x: xPercent, y: yPercent });

                    setZoomStyle({
                        transform: 'scale(3.5)', // ~100km zoom
                        transformOrigin: `${xPercent}% ${yPercent}%`,
                        transition: 'transform 1s ease-in-out'
                    });
                }
            } catch (e) {
                console.error("Zoom calc failed", e);
            }
        };

        calculateZoom();
    }, [config.weatherLocation]);

    return (
        <div className="h-full w-full bg-slate-900 rounded-xl shadow-lg border border-slate-700 overflow-hidden relative flex flex-col">
            <div className="flex-1 relative overflow-hidden bg-slate-800">
                {/* DWD Gif & Marker - Wrapped for Zoom */}
                <div
                    className="w-full h-full relative transition-transform duration-700"
                    style={zoomStyle}
                >
                    <img
                        src={radarUrl}
                        alt="Regenradar Deutschland"
                        className="w-full h-full object-contain opacity-90"
                    />

                    {/* Location Marker */}
                    {markerPos && (
                        <div
                            className="absolute w-3 h-3 bg-red-600 rounded-full border-2 border-white shadow-md transform -translate-x-1/2 -translate-y-1/2 animate-pulse"
                            style={{
                                left: `${markerPos.x}%`,
                                top: `${markerPos.y}%`
                            }}
                        />
                    )}
                </div>
            </div>

            {/* Title Overlay */}
            <div className="absolute top-0 left-0 bg-slate-900/60 px-2 py-1 rounded-br-lg pointer-events-none z-10 backdrop-blur-sm border-r border-b border-slate-700">
                <span className="text-white text-xs font-semibold">
                    {config.weatherLocation ? config.weatherLocation : 'Regenradar (DWD)'}
                </span>
            </div>
        </div>
    );
};
