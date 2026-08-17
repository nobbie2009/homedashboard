import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plane, TrendingUp, TrendingDown, Minus, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
import { useFlights, fr24Link, compassLabel, Flight } from '../../hooks/useFlights';
import { useTheme } from '../../hooks/useTheme';

const HOME_ICON = L.divIcon({
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

/** Higher = colder colors; keeps the map readable at a glance. */
function altitudeColor(ft: number | null, onGround: boolean): string {
    if (onGround) return '#94a3b8';
    if (ft === null) return '#64748b';
    if (ft < 5000) return '#ef4444';
    if (ft < 15000) return '#f59e0b';
    if (ft < 25000) return '#22c55e';
    if (ft < 35000) return '#0ea5e9';
    return '#a855f7';
}

function planeIcon(flight: Flight, selected: boolean): L.DivIcon {
    const color = altitudeColor(flight.altitudeFt, flight.onGround);
    const size = selected ? 34 : 26;
    const label = flight.callsign || flight.registration || '';

    return L.divIcon({
        className: '',
        html: `
            <div style="position:relative;width:${size}px;height:${size}px;">
                <svg viewBox="0 0 24 24" width="${size}" height="${size}"
                     style="transform: rotate(${flight.track ?? 0}deg); filter: drop-shadow(0 1px 2px rgba(0,0,0,.45));">
                    <path fill="${color}" stroke="${selected ? '#0f172a' : 'rgba(255,255,255,.85)'}" stroke-width="0.8"
                          d="M12 2 L14 9 L22 13 L22 15 L14 13.5 L13.2 19.5 L16 21.5 L16 22.5 L12 21.5 L8 22.5 L8 21.5 L10.8 19.5 L10 13.5 L2 15 L2 13 L10 9 Z" />
                </svg>
                ${selected && label ? `<div style="
                    position:absolute; top:${size}px; left:50%; transform:translateX(-50%);
                    white-space:nowrap; font: 700 10px/1.4 ui-monospace, monospace;
                    background:rgba(15,23,42,.85); color:#fff; padding:1px 5px; border-radius:4px;
                ">${label}</div>` : ''}
            </div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

/** Keeps the map on the configured home position and follows a selected plane. */
const MapController: React.FC<{ center: [number, number]; radiusKm: number; focus: Flight | null }> = ({ center, radiusKm, focus }) => {
    const map = useMap();
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        if (initialized) return;
        // Fit the configured radius circle into the viewport.
        const latPad = radiusKm / 111;
        map.fitBounds([
            [center[0] - latPad, center[1] - latPad * 1.6],
            [center[0] + latPad, center[1] + latPad * 1.6],
        ]);
        setInitialized(true);
    }, [center, radiusKm, map, initialized]);

    useEffect(() => {
        if (focus) map.panTo([focus.lat, focus.lon]);
    }, [focus, map]);

    return null;
};

const TrendBadge: React.FC<{ trend: Flight['trend'] }> = ({ trend }) => {
    if (trend === 'climb') return <TrendingUp className="w-4 h-4 text-emerald-500" />;
    if (trend === 'descent') return <TrendingDown className="w-4 h-4 text-amber-500" />;
    return <Minus className="w-4 h-4 text-slate-400" />;
};

export const FlightsView: React.FC = () => {
    const { data, flights, loading, error, refresh } = useFlights(100);
    const { isDark } = useTheme();
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const center = useMemo<[number, number]>(
        () => [data?.center?.lat ?? 51.1, data?.center?.lon ?? 10.4],
        [data?.center?.lat, data?.center?.lon]
    );

    const selected = flights.find(f => f.id === selectedId) || null;

    // Drop the selection when the aircraft leaves the radius.
    useEffect(() => {
        if (selectedId && !loading && flights.length > 0 && !flights.some(f => f.id === selectedId)) {
            setSelectedId(null);
        }
    }, [flights, selectedId, loading]);

    const tileUrl = isDark
        ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

    const updated = data?.updatedAt
        ? new Date(data.updatedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—';

    return (
        <div className="h-full flex gap-4">
            {/* Map */}
            <div className="flex-1 relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
                <MapContainer
                    center={center}
                    zoom={9}
                    zoomControl={false}
                    attributionControl={false}
                    className="w-full h-full z-0"
                    style={{ background: isDark ? '#0f172a' : '#f1f5f9' }}
                >
                    <TileLayer key={isDark ? 'dark' : 'light'} url={tileUrl} maxZoom={16} />
                    <MapController center={center} radiusKm={data?.radiusKm ?? 60} focus={selected} />

                    <Circle
                        center={center}
                        radius={(data?.radiusKm ?? 60) * 1000}
                        pathOptions={{ color: '#0ea5e9', weight: 1, opacity: 0.5, fillOpacity: 0.04 }}
                    />
                    <Marker position={center} icon={HOME_ICON} />

                    {flights.map(f => (
                        <Marker
                            key={f.id}
                            position={[f.lat, f.lon]}
                            icon={planeIcon(f, f.id === selectedId)}
                            eventHandlers={{ click: () => setSelectedId(f.id) }}
                            zIndexOffset={f.id === selectedId ? 1000 : 0}
                        />
                    ))}
                </MapContainer>

                {/* Status bar */}
                <div className="absolute top-0 left-0 z-[1000]">
                    <div className="flex items-center gap-2 px-3 py-2 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md rounded-br-xl border-r border-b border-slate-200/60 dark:border-slate-700/60">
                        <Plane className="w-4 h-4 text-sky-500" />
                        <span className="text-sm font-semibold text-slate-700 dark:text-white/90 tabular-nums">
                            {flights.length} Flugzeuge
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">· {updated}</span>
                        {data?.stale && <span className="text-xs text-amber-500">· veraltet</span>}
                        <button
                            onClick={refresh}
                            className="ml-1 text-slate-400 hover:text-sky-500 transition"
                            title="Jetzt aktualisieren"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Altitude legend + attribution */}
                <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none">
                    <div className="flex items-end justify-between gap-2 p-2">
                        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md rounded-lg border border-slate-200/60 dark:border-slate-700/60">
                            {[
                                { c: '#ef4444', l: '<5k' },
                                { c: '#f59e0b', l: '<15k' },
                                { c: '#22c55e', l: '<25k' },
                                { c: '#0ea5e9', l: '<35k' },
                                { c: '#a855f7', l: '35k+' },
                            ].map(({ c, l }) => (
                                <div key={l} className="flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
                                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{l} ft</span>
                                </div>
                            ))}
                        </div>
                        <div className="text-[9px] text-slate-400 dark:text-slate-600 bg-white/70 dark:bg-slate-900/70 px-1.5 py-0.5 rounded">
                            Karte © OpenStreetMap / CARTO · Flugdaten {data?.source || 'ADS-B'}
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="absolute inset-x-0 top-14 z-[1000] flex justify-center">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/90 text-white text-sm shadow-lg">
                            <AlertTriangle className="w-4 h-4" />
                            {error}
                        </div>
                    </div>
                )}
            </div>

            {/* Sidebar: detail + list */}
            <div className="w-80 shrink-0 flex flex-col gap-4 overflow-hidden">
                {selected && (
                    <div className="widget-card p-4 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl border border-slate-300 dark:border-slate-700 shrink-0">
                        <div className="flex items-start justify-between mb-2">
                            <div>
                                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                                    {selected.callsign || selected.registration || selected.hex}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {selected.description || selected.aircraftType || 'Unbekannter Typ'}
                                </div>
                            </div>
                            <TrendBadge trend={selected.trend} />
                        </div>

                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                            <div>
                                <dt className="text-slate-400 dark:text-slate-500">Höhe</dt>
                                <dd className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                                    {selected.onGround ? 'am Boden'
                                        : selected.altitudeFt !== null ? `${selected.altitudeFt.toLocaleString('de-DE')} ft · ${selected.altitudeM?.toLocaleString('de-DE')} m` : '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-slate-400 dark:text-slate-500">Geschwindigkeit</dt>
                                <dd className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                                    {selected.speedKmh !== null ? `${selected.speedKmh} km/h` : '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-slate-400 dark:text-slate-500">Entfernung</dt>
                                <dd className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                                    {selected.distanceKm} km {compassLabel(selected.bearing)}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-slate-400 dark:text-slate-500">Kurs</dt>
                                <dd className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                                    {selected.track !== null ? `${Math.round(selected.track)}°` : '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-slate-400 dark:text-slate-500">Kennung</dt>
                                <dd className="font-semibold text-slate-700 dark:text-slate-200 font-mono">
                                    {selected.registration || '—'}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-slate-400 dark:text-slate-500">Squawk</dt>
                                <dd className="font-semibold text-slate-700 dark:text-slate-200 font-mono">
                                    {selected.squawk || '—'}
                                </dd>
                            </div>
                        </dl>

                        {selected.emergency && (
                            <div className="mt-2 text-xs font-bold text-red-500">Notfall-Squawk: {selected.emergency}</div>
                        )}

                        <a
                            href={fr24Link(selected)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 flex items-center justify-center gap-1.5 w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition"
                        >
                            Auf Flightradar24 öffnen
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    </div>
                )}

                <div className="widget-card flex-1 p-3 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl border border-slate-300 dark:border-slate-700 overflow-y-auto">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2 px-1">
                        In der Nähe
                    </h3>

                    {flights.length === 0 && (
                        <div className="text-sm text-slate-400 dark:text-slate-500 px-1 py-6 text-center">
                            {loading ? 'Lade Flugdaten…' : 'Gerade kein Flugzeug im Umkreis'}
                        </div>
                    )}

                    <div className="space-y-1">
                        {flights.map(f => (
                            <button
                                key={f.id}
                                onClick={() => setSelectedId(f.id)}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition ${
                                    f.id === selectedId
                                        ? 'bg-sky-500/20 ring-1 ring-sky-500/40'
                                        : 'hover:bg-white/50 dark:hover:bg-slate-700/40'
                                }`}
                            >
                                <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ background: altitudeColor(f.altitudeFt, f.onGround) }}
                                />
                                <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100 w-16 truncate shrink-0">
                                    {f.callsign || f.registration || f.hex}
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {f.aircraftType || '—'}
                                </span>
                                <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                                    {f.distanceKm} km
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FlightsView;
