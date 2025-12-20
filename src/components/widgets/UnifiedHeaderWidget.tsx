import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Cloud, CloudRain, Sun, CloudSnow } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';

// --- Weather Types & Helper ---
interface WeatherData {
    current: {
        temp: number;
        code: number;
    };
    forecast: {
        day: string;
        tempMax: number;
        tempMin: number;
        code: number;
    }[];
}

const getWeatherIcon = (code: number, className?: string) => {
    // WMO Weather interpretation codes (0-99)
    if (code >= 95) return <CloudRain className={className} />; // Thunderstorm
    if (code >= 71) return <CloudSnow className={className} />; // Snow
    if (code >= 51) return <CloudRain className={className} />; // Rain/Drizzle
    if (code >= 45) return <Cloud className={className} />; // Fog
    if (code >= 1) return <Cloud className={className} />; // Clouds
    return <Sun className={className} />; // Clear sky (0)
};

const getWeatherDescription = (code: number) => {
    if (code >= 95) return 'Gewitter';
    if (code >= 71) return 'Schnee';
    if (code >= 61) return 'Regen';
    if (code >= 51) return 'Nieselregen';
    if (code >= 45) return 'Nebel';
    if (code >= 3) return 'Bedeckt';
    if (code >= 1) return 'Teils Wolkig';
    return 'Klar';
};

export const UnifiedHeaderWidget: React.FC = () => {
    const { config } = useConfig();
    const [time, setTime] = useState(new Date());
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loadingWeather, setLoadingWeather] = useState(false);

    // Clock
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Weather Fetching (OpenMeteo)
    useEffect(() => {
        const fetchWeather = async () => {
            if (!config.weatherLocation) return;
            setLoadingWeather(true);
            try {
                // 1. Geocoding
                const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(config.weatherLocation)}&count=1&language=de&format=json`);
                const geoData = await geoRes.json();

                if (!geoData.results?.length) return;

                const { latitude, longitude } = geoData.results[0];

                // 2. Forecast
                const weatherRes = await fetch(
                    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`
                );
                const data = await weatherRes.json();

                const forecast = data.daily.time.slice(0, 3).map((t: string, i: number) => ({
                    day: new Date(t).toLocaleDateString('de-DE', { weekday: 'short' }),
                    tempMax: Math.round(data.daily.temperature_2m_max[i]),
                    tempMin: Math.round(data.daily.temperature_2m_min[i]),
                    code: data.daily.weather_code[i]
                }));

                setWeather({
                    current: {
                        temp: Math.round(data.current.temperature_2m),
                        code: data.current.weather_code
                    },
                    forecast
                });

            } catch (error) {
                console.error("Failed to fetch weather", error);
            } finally {
                setLoadingWeather(false);
            }
        };

        fetchWeather();
        // Refresh weather every 30 mins
        const interval = setInterval(fetchWeather, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, [config.weatherLocation]);

    return (
        <div className="grid grid-cols-3 items-center bg-slate-800/60 rounded-xl backdrop-blur-md shadow-lg w-full h-full border border-slate-700 text-white relative overflow-hidden">
            {/* Background Decoration/Gradient could go here */}

            {/* LEFT: Clock */}
            <div className="flex flex-col justify-center items-start pl-8 h-full">
                <div className="text-[7rem] xl:text-[9rem] font-black tracking-tighter tabular-nums leading-none bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">
                    {format(time, 'HH:mm')}
                </div>
                {config.showSeconds && (
                    <div className="text-2xl text-slate-500 font-mono mt-[-5px] pl-2">
                        {format(time, ':ss')}
                    </div>
                )}
            </div>

            {/* CENTER: Weather */}
            <div className="flex flex-col items-center justify-center border-l border-r border-slate-700/50 h-full w-full">
                {weather ? (
                    <>
                        <div className="flex items-center space-x-6 mb-3">
                            {getWeatherIcon(weather.current.code, "w-24 h-24 text-yellow-400 drop-shadow-lg")}
                            <div className="flex flex-col">
                                <span className="text-7xl font-bold">{weather.current.temp}°</span>
                                <span className="text-slate-400 text-lg font-medium uppercase tracking-wide">
                                    {getWeatherDescription(weather.current.code)}
                                </span>
                            </div>
                        </div>
                        <div className="flex space-x-8 mt-2">
                            {weather.forecast.map((day, idx) => (
                                <div key={idx} className="flex flex-col items-center">
                                    <span className="text-slate-500 text-sm mb-1 uppercase font-bold">{day.day}</span>
                                    {getWeatherIcon(day.code, "w-8 h-8 text-slate-300 mb-1")}
                                    <span className="text-lg font-semibold">{day.tempMax}° <span className="text-slate-600 text-base">{day.tempMin}°</span></span>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="text-slate-500 animate-pulse text-xl">
                        {loadingWeather ? 'Lade Wetter...' : 'Wetter nicht verfügbar'}
                    </div>
                )}
            </div>

            {/* RIGHT: Date */}
            <div className="flex flex-col items-end justify-center pr-8 h-full">
                <div className="text-5xl font-bold text-blue-400 uppercase tracking-wide">
                    {format(time, 'EEEE', { locale: de })}
                </div>
                <div className="text-4xl text-slate-200 font-light mt-1">
                    {format(time, 'd. MMMM', { locale: de })}
                </div>
                <div className="text-slate-500 mt-2 font-medium text-lg">
                    KW {format(time, 'w', { locale: de })}
                </div>
            </div>
        </div>
    );
};
