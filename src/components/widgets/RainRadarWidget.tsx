import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CloudRain } from 'lucide-react';

// Custom location marker icon
const locationIcon = L.divIcon({
    className: '',
    html: `<div style="
        width: 14px; height: 14px;
        background: #ef4444;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(239,68,68,0.5), 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
});

// RainViewer API types
interface RainViewerData {
    radar: {
        past: { path: string; time: number }[];
        nowcast: { path: string; time: number }[];
    };
}

// Component to handle map center changes
const MapUpdater: React.FC<{ center: [number, number] }> = ({ center }) => {
    const map = useMap();
    useEffect(() => {
        map.setView(center, 6);
    }, [center, map]);
    return null;
};

export const RainRadarWidget: React.FC = () => {
    const { config } = useConfig();
    const [coords, setCoords] = useState<[number, number]>([51.1, 10.4]);
    const [radarFrames, setRadarFrames] = useState<{ path: string; time: number }[]>([]);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [radarHost, setRadarHost] = useState('');
    const radarLayerRef = useRef<L.TileLayer | null>(null);
    const mapRef = useRef<L.Map | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval>>();

    // Geocode location
    useEffect(() => {
        if (!config.weatherLocation) return;
        const geocode = async () => {
            try {
                const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(config.weatherLocation)}&count=1&language=de&format=json`);
                const data = await res.json();
                if (data.results?.[0]) {
                    setCoords([data.results[0].latitude, data.results[0].longitude]);
                }
            } catch (e) {
                console.error('Geocoding failed', e);
            }
        };
        geocode();
    }, [config.weatherLocation]);

    // Fetch RainViewer radar frames
    useEffect(() => {
        const fetchRadar = async () => {
            try {
                const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
                const data: RainViewerData = await res.json();
                setRadarHost('https://tilecache.rainviewer.com');
                const allFrames = [
                    ...data.radar.past,
                    ...data.radar.nowcast.slice(0, 3),
                ];
                setRadarFrames(allFrames);
                setCurrentFrame(data.radar.past.length - 1);
            } catch (e) {
                console.error('RainViewer fetch failed', e);
            }
        };
        fetchRadar();
        const timer = setInterval(fetchRadar, 5 * 60 * 1000);
        return () => clearInterval(timer);
    }, []);

    // Auto-play animation
    useEffect(() => {
        if (radarFrames.length > 0) {
            intervalRef.current = setInterval(() => {
                setCurrentFrame(prev => (prev + 1) % radarFrames.length);
            }, 800);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [radarFrames.length]);

    // Update radar tile layer when frame changes
    useEffect(() => {
        if (!mapRef.current || radarFrames.length === 0 || !radarHost) return;

        const frame = radarFrames[currentFrame];
        if (!frame) return;

        const tileUrl = `${radarHost}${frame.path}/256/{z}/{x}/{y}/4/1_1.png`;

        if (radarLayerRef.current) {
            radarLayerRef.current.setUrl(tileUrl);
        } else {
            radarLayerRef.current = L.tileLayer(tileUrl, {
                opacity: 0.7,
                zIndex: 10,
            }).addTo(mapRef.current);
        }
    }, [currentFrame, radarFrames, radarHost]);

    // Format timestamp
    const frameTime = useMemo(() => {
        if (radarFrames.length === 0 || !radarFrames[currentFrame]) return '';
        const d = new Date(radarFrames[currentFrame].time * 1000);
        return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    }, [currentFrame, radarFrames]);

    const isPast = useMemo(() => {
        if (radarFrames.length === 0 || !radarFrames[currentFrame]) return true;
        return radarFrames[currentFrame].time * 1000 <= Date.now();
    }, [currentFrame, radarFrames]);

    // Check if Santa Route is enabled
    if (config.santaRouteEnabled) {
        const santaUrl = config.santaRouteAddress || 'https://www.noradsanta.org/en/map';
        return (
            <div className="h-full w-full overflow-hidden relative">
                <iframe src={santaUrl} title="Santa Tracker" className="w-full h-full border-0" allowFullScreen />
            </div>
        );
    }

    return (
        <div className="h-full w-full rounded-xl overflow-hidden relative border border-slate-200/50 dark:border-slate-700/50 shadow-lg">
            {/* Leaflet Map */}
            <MapContainer
                center={coords}
                zoom={6}
                minZoom={3}
                maxZoom={6}
                zoomControl={false}
                attributionControl={false}
                className="w-full h-full z-0"
                ref={mapRef}
                style={{ background: '#f1f5f9' }}
            >
                {/* Light map tiles (Positron) */}
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    maxZoom={6}
                />
                <MapUpdater center={coords} />
                <Marker position={coords} icon={locationIcon} />
            </MapContainer>

            {/* Header overlay */}
            <div className="absolute top-0 left-0 z-[1000] pointer-events-none">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-br-xl border-r border-b border-slate-200/60 dark:border-slate-700/60">
                    <CloudRain className="w-3.5 h-3.5 text-sky-500" />
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-white/90">
                        {config.weatherLocation || 'Regenradar'}
                    </span>
                </div>
            </div>

            {/* Minimal bottom bar: timeline + time */}
            {radarFrames.length > 0 && (
                <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none">
                    <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200/60 dark:border-slate-700/60 px-3 py-1.5">
                        {/* Timeline dots */}
                        <div className="flex items-center gap-[2px] mb-1">
                            {radarFrames.map((_, i) => (
                                <div
                                    key={i}
                                    className={`flex-1 h-1 rounded-full transition-all ${
                                        i === currentFrame
                                            ? 'bg-sky-500 shadow-[0_0_4px_rgba(14,165,233,0.5)]'
                                            : i < currentFrame
                                                ? 'bg-sky-300/50 dark:bg-sky-600/40'
                                                : 'bg-slate-300/60 dark:bg-slate-700/60'
                                    }`}
                                />
                            ))}
                        </div>
                        {/* Time display */}
                        <div className="flex items-center justify-end gap-1.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                isPast
                                    ? 'bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300'
                                    : 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300'
                            }`}>
                                {isPast ? 'Aktuell' : 'Prognose'}
                            </span>
                            <span className="text-xs font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                                {frameTime}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Rain intensity legend */}
            <div className="absolute top-0 right-0 z-[1000] pointer-events-none">
                <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md rounded-bl-xl px-2 py-1.5 border-l border-b border-slate-200/60 dark:border-slate-700/60">
                    <div className="flex items-center gap-0.5">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#20c0ff' }} title="Leicht" />
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#20ff20' }} title="Mäßig" />
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#ffff20' }} title="Stark" />
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ background: '#ff2020' }} title="Sehr stark" />
                    </div>
                </div>
            </div>
        </div>
    );
};
