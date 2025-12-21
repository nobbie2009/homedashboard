import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Cloud, CloudRain, CloudSnow, Moon, CloudLightning } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';

interface WeatherData {
    current: {
        temp: number;
        code: number;
    };
}

const getWeatherIcon = (code: number, className?: string) => {
    // Basic mapping
    if (code >= 95) return <CloudLightning className={className} />;
    if (code >= 71) return <CloudSnow className={className} />;
    if (code >= 51) return <CloudRain className={className} />;
    if (code >= 45) return <Cloud className={className} />;
    if (code >= 1) return <Cloud className={className} />;
    return <Moon className={className} />; // Night mode default
};

export const Screensaver: React.FC<{ active: boolean; onDismiss: () => void }> = ({ active, onDismiss }) => {
    const { config } = useConfig();
    const [time, setTime] = useState(new Date());
    const [weather, setWeather] = useState<WeatherData | null>(null);

    // Clock Tick
    useEffect(() => {
        if (!active) return;
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, [active]);

    // Simple Weather Fetch (Reusing logic lighter)
    useEffect(() => {
        if (!active || !config.weatherLocation) return;

        const fetchWeather = async () => {
            try {
                const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(config.weatherLocation)}&count=1&language=de&format=json`);
                const geoData = await geoRes.json();
                if (!geoData.results?.length) return;
                const { latitude, longitude } = geoData.results[0];

                const weatherRes = await fetch(
                    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`
                );
                const data = await weatherRes.json();
                setWeather({
                    current: {
                        temp: Math.round(data.current.temperature_2m),
                        code: data.current.weather_code
                    }
                });
            } catch (e) {
                console.error("Screensaver weather err", e);
            }
        };

        fetchWeather();
        // No auto-refresh for screensaver to save resources, just on mount/show
    }, [active, config.weatherLocation]);

    if (!active) return null;

    return (
        <div
            className="fixed inset-0 z-50 bg-black text-white cursor-none flex flex-col items-center justify-center select-none"
            onClick={onDismiss}
            onTouchStart={onDismiss}
        >
            {/* Clock Big */}
            <div className="flex flex-col items-center justify-center animate-pulse duration-[10000ms]">
                <div className="text-[15rem] font-black tracking-tighter tabular-nums leading-none text-slate-800/80 drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                    {format(time, 'HH:mm')}
                </div>

                {/* Date & Weather Row */}
                <div className="flex items-center gap-12 mt-8 text-slate-500 text-4xl font-light">
                    <div>
                        {format(time, 'EEEE, d. MMMM', { locale: de })}
                    </div>

                    {weather && (
                        <div className="flex items-center gap-4 border-l border-slate-800 pl-12">
                            {getWeatherIcon(weather.current.code, "w-12 h-12")}
                            <span>{weather.current.temp}°</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Hint */}
            <div className="absolute bottom-12 text-slate-800 text-sm">
                Berühren zum Aufwecken
            </div>
        </div>
    );
};
