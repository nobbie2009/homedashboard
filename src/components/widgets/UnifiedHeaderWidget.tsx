import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Cloud, CloudRain, Sun, CloudSnow, Sunrise, Sunset } from 'lucide-react';
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
    sunrise?: string;
    sunset?: string;
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
    const [alerts, setAlerts] = useState<any[]>([]); // New State for Alerts
    const [loadingWeather, setLoadingWeather] = useState(false);

    // Clock
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Weather Fetching (OpenMeteo + Brightsky)
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

                // 2. Forecast (OpenMeteo) - now including sunrise/sunset
                const weatherRes = await fetch(
                    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto`
                );
                const data = await weatherRes.json();

                const forecast = data.daily.time.slice(0, 3).map((t: string, i: number) => ({
                    day: new Date(t).toLocaleDateString('de-DE', { weekday: 'short' }),
                    tempMax: Math.round(data.daily.temperature_2m_max[i]),
                    tempMin: Math.round(data.daily.temperature_2m_min[i]),
                    code: data.daily.weather_code[i]
                }));

                // Extract sunrise/sunset for today (first entry)
                const sunriseTime = data.daily.sunrise?.[0] ? format(new Date(data.daily.sunrise[0]), 'HH:mm') : undefined;
                const sunsetTime = data.daily.sunset?.[0] ? format(new Date(data.daily.sunset[0]), 'HH:mm') : undefined;

                setWeather({
                    current: {
                        temp: Math.round(data.current.temperature_2m),
                        code: data.current.weather_code
                    },
                    forecast,
                    sunrise: sunriseTime,
                    sunset: sunsetTime
                });

                // 3. Alerts (Brightsky / DWD)
                try {
                    const alertRes = await fetch(
                        `https://api.brightsky.dev/alerts?lat=${latitude}&lon=${longitude}`
                    );
                    const alertData = await alertRes.json();
                    if (alertData.alerts) {
                        setAlerts(alertData.alerts);
                    } else {
                        setAlerts([]);
                    }
                } catch (alertError) {
                    console.error("Failed to fetch alerts", alertError);
                    setAlerts([]);
                }

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

    // Filter Alerts
    const filteredAlerts = alerts.filter(a => {
        // Event code can be checked, or event_de name
        // DWD event codes are rough, let's use broad category matching if possible, or just exact string match from exclusions
        // Exclusions list contains strings like 'FROST', 'THUNDERSTORM', etc.
        // We need to map DWD event to these categories or just check if event_de contains string? 
        // Let's assume exclusions are mapped to: 'fog', 'frost', 'rain', 'snow', 'thunderstorm', 'wind', 'heat', 'uv', 'ice'

        const exclusions = (config.weatherAlertExclusions || []).map(e => e.toLowerCase());
        const eventName = (a.event_en || '').toLowerCase(); // Use English for better mapping if available, otherwise just rely on code? Brightsky gives `event_en`.

        if (exclusions.includes('frost') && eventName.includes('frost')) return false;
        if (exclusions.includes('fog') && eventName.includes('fog')) return false;
        if (exclusions.includes('wind') && (eventName.includes('wind') || eventName.includes('storm') || eventName.includes('gust'))) return false;
        if (exclusions.includes('thunderstorm') && eventName.includes('thunderstorm')) return false;
        if (exclusions.includes('rain') && eventName.includes('rain')) return false;
        if (exclusions.includes('snow') && eventName.includes('snow')) return false;
        if (exclusions.includes('heat') && eventName.includes('heat')) return false;
        if (exclusions.includes('uv') && eventName.includes('uv')) return false;
        if (exclusions.includes('ice') && (eventName.includes('ice') || eventName.includes('glaze'))) return false;

        return true;
    });

    // Grid config: 3 columns normally, 4 if alerts exist (Clock | Weather | Alerts | Date)
    // Or adjust the middle section to split. Let's try flexible grid.
    const hasAlerts = filteredAlerts.length > 0;
    // Wider columns to prevent text cutoff
    const gridClass = hasAlerts
        ? "grid grid-cols-[auto_1fr_minmax(280px,1.5fr)_auto]"
        : "grid grid-cols-[auto_1fr_auto]";

    return (
        <div className={`${gridClass} items-center bg-slate-800/60 rounded-xl backdrop-blur-md shadow-lg w-full h-full border border-slate-700 text-white relative overflow-hidden transition-all duration-500`}>

            {/* LEFT: Clock */}
            <div className="flex flex-row items-baseline justify-start pl-8 h-full pt-4">
                <div className="text-[10rem] font-black tracking-tighter tabular-nums leading-none bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent transform translate-y-[-0.05em]">
                    {format(time, 'HH:mm')}
                </div>
                {config.showSeconds && (
                    <div className="text-6xl text-slate-500 font-mono ml-4 font-medium mb-8">
                        {format(time, ':ss')}
                    </div>
                )}
            </div>

            {/* CENTER LEFT: Weather */}
            <div className={`flex flex-row items-center justify-center border-l ${hasAlerts ? 'border-r' : 'border-r'} border-slate-700/50 h-full w-full gap-8`}>
                {weather ? (
                    <>
                        <div className="flex items-center space-x-4">
                            {getWeatherIcon(weather.current.code, "w-16 h-16 text-yellow-400 drop-shadow-lg")}
                            <div className="flex flex-col">
                                <span className="text-6xl font-bold leading-none">{weather.current.temp}°</span>
                                <span className="text-slate-400 text-sm font-medium uppercase tracking-wide mt-1">
                                    {getWeatherDescription(weather.current.code)}
                                </span>
                            </div>
                        </div>
                        {/* Hide forecast on small split if needed, but space should be fine */}
                        {!hasAlerts && (
                            <>
                                <div className="h-12 w-px bg-slate-700/50"></div>
                                <div className="flex space-x-6">
                                    {weather.forecast.map((day, idx) => (
                                        <div key={idx} className="flex flex-col items-center">
                                            <span className="text-slate-500 text-xs mb-1 uppercase font-bold">{day.day}</span>
                                            {getWeatherIcon(day.code, "w-6 h-6 text-slate-300 mb-1")}
                                            <span className="text-base font-semibold">{day.tempMax}° <span className="text-slate-600 text-sm">{day.tempMin}°</span></span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                        {/* If has alerts, maybe just show Today + Tomorrow small or omit forecast to save space? 
                            Let's keep it simple for now and just show current weather in this block if space is tight.
                        */}
                    </>
                ) : (
                    <div className="text-slate-500 animate-pulse text-lg">
                        {loadingWeather ? 'Lade Wetter...' : 'Wetter nicht verfügbar'}
                    </div>
                )}
            </div>

            {/* CENTER RIGHT: Alerts (Visible only if hasAlerts) */}
            {hasAlerts && (
                <div className="h-full w-full py-4 px-2 flex items-center justify-center border-r border-slate-700/50">
                    <div className="w-full h-full max-h-[90%] border-2 border-yellow-500/80 bg-yellow-500/10 rounded-lg shadow-[0_0_15px_rgba(234,179,8,0.3)] flex flex-col justify-center px-4 relative overflow-hidden animate-pulse-slow">
                        {/* Header */}
                        <div className="flex items-center text-yellow-500 mb-2">
                            <CloudRain className="w-6 h-6 mr-2 flex-shrink-0" />
                            <span className="font-bold text-lg uppercase tracking-wider">Unwetterwarnung</span>
                        </div>
                        {/* Scroll through alerts if multiple, or show first */}
                        <div className="text-white text-lg leading-tight font-medium overflow-y-auto max-h-[70%] custom-scrollbar">
                            {/* Deduplicate and join by comma */}
                            {Array.from(new Set(filteredAlerts.map(a => a.event_de || a.headline_de))).join(', ')}
                        </div>
                        <div className="text-yellow-500/60 text-[10px] mt-2 font-mono absolute bottom-1 right-2">
                            DWD
                        </div>
                    </div>
                </div>
            )}

            {/* RIGHT: Date + Sunrise/Sunset */}
            <div className="flex flex-col items-end justify-center pr-8 h-full">
                <div className="text-5xl font-bold text-blue-400 uppercase tracking-wide">
                    {format(time, 'EEEE', { locale: de })}
                </div>
                <div className="text-4xl text-slate-200 font-light mt-1">
                    {format(time, 'd. MMMM', { locale: de })}
                </div>
                <div className="flex items-center gap-4 mt-2">
                    <span className="text-slate-500 font-medium text-lg">
                        KW {format(time, 'w', { locale: de })}
                    </span>
                    {weather?.sunrise && weather?.sunset && (
                        <div className="flex items-center gap-3 text-sm">
                            <span className="flex items-center gap-1 text-orange-400">
                                <Sunrise className="w-4 h-4" />
                                {weather.sunrise}
                            </span>
                            <span className="flex items-center gap-1 text-indigo-400">
                                <Sunset className="w-4 h-4" />
                                {weather.sunset}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
