import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plane, TrendingUp, TrendingDown } from 'lucide-react';
import { useFlights, compassLabel, Flight } from '../../hooks/useFlights';

const TrendIcon: React.FC<{ trend: Flight['trend'] }> = ({ trend }) => {
    if (trend === 'climb') return <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />;
    if (trend === 'descent') return <TrendingDown className="w-3 h-3 text-amber-500 shrink-0" />;
    return null;
};

export const FlightRadarWidget: React.FC = () => {
    const navigate = useNavigate();
    // Only the closest handful fit the tile; the page shows everything.
    const { flights, loading, error } = useFlights(12);

    const visible = flights.slice(0, 4);

    return (
        <div
            onClick={() => navigate('/flights')}
            className="widget-card flex flex-col p-4 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl border border-slate-300 dark:border-slate-700 h-full cursor-pointer overflow-hidden"
        >
            <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="flex items-center gap-1.5">
                    <Plane className="w-4 h-4 text-sky-500" />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Flugradar</span>
                </div>
                {flights.length > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300 tabular-nums">
                        {flights.length}
                    </span>
                )}
            </div>

            {error && (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400 dark:text-slate-500 text-center">
                    Flugdaten nicht verfügbar
                </div>
            )}

            {!error && loading && visible.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                    Lade…
                </div>
            )}

            {!error && !loading && visible.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-xs text-slate-400 dark:text-slate-500 text-center">
                    Gerade kein Flugzeug in der Nähe
                </div>
            )}

            <div className="flex-1 space-y-1.5 overflow-hidden">
                {visible.map(f => (
                    <div key={f.id} className="flex items-center gap-2 text-xs">
                        {/* Arrow points the way the aircraft is heading (0° = north) */}
                        <Plane
                            className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0"
                            style={{ transform: `rotate(${(f.track ?? 0)}deg)` }}
                        />
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-100 truncate w-16 shrink-0">
                            {f.callsign || f.registration || f.hex || '—'}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                            {f.distanceKm.toFixed(0)} km {compassLabel(f.bearing)}
                        </span>
                        <span className="ml-auto flex items-center gap-1 text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                            <TrendIcon trend={f.trend} />
                            {f.onGround ? 'Boden' : f.altitudeFt !== null ? `${Math.round(f.altitudeFt / 100) * 100} ft` : '—'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};
