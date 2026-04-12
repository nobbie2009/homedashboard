import React, { useState, useEffect, useRef, useCallback } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Cloud, CloudRain, CloudSnow, Moon, CloudLightning } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { useSecurity } from '../../contexts/SecurityContext';
import { getApiUrl } from '../../utils/api';

interface WeatherData {
    current: {
        temp: number;
        code: number;
    };
}

interface IcloudPhoto {
    id: string;
    url: string;
    width: number;
    height: number;
    caption?: string;
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

// --- Transition effects ---
const TRANSITION_TYPES = ['crossfade', 'slide', 'push', 'zoom', 'flip', 'blur'] as const;
type TransitionType = typeof TRANSITION_TYPES[number];

const ENTER_CLASS: Record<TransitionType, string> = {
    crossfade: 'animate-ss-crossfade-enter',
    slide: 'animate-ss-slide-enter',
    push: 'animate-ss-push-enter',
    zoom: 'animate-ss-zoom-enter',
    flip: 'animate-ss-flip-enter',
    blur: 'animate-ss-blur-enter',
};
const EXIT_CLASS: Record<TransitionType, string> = {
    crossfade: 'animate-ss-crossfade-exit',
    slide: 'animate-ss-slide-exit',
    push: 'animate-ss-push-exit',
    zoom: 'animate-ss-zoom-exit',
    flip: 'animate-ss-flip-exit',
    blur: 'animate-ss-blur-exit',
};

function pickTransition(setting: string | undefined): TransitionType {
    if (setting && setting !== 'random' && TRANSITION_TYPES.includes(setting as TransitionType)) {
        return setting as TransitionType;
    }
    return TRANSITION_TYPES[Math.floor(Math.random() * TRANSITION_TYPES.length)];
}

export type ScreensaverMode = 'clock' | 'photos';

interface Props {
    active: boolean;
    mode: ScreensaverMode;
    onDismiss: () => void;
}

export const Screensaver: React.FC<Props> = ({ active, mode, onDismiss }) => {
    const { config } = useConfig();
    const { deviceId } = useSecurity();
    const [time, setTime] = useState(new Date());
    const [weather, setWeather] = useState<WeatherData | null>(null);

    // Photo slideshow state
    const [photos, setPhotos] = useState<IcloudPhoto[]>([]);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const photoOrderRef = useRef<number[]>([]);

    // A/B swap state for transitions
    const [slotA, setSlotA] = useState<IcloudPhoto | null>(null);
    const [slotB, setSlotB] = useState<IcloudPhoto | null>(null);
    const [activeSlot, setActiveSlot] = useState<'a' | 'b'>('a');
    const [transition, setTransition] = useState<TransitionType>('crossfade');
    const [animating, setAnimating] = useState(false);
    const orderIndexRef = useRef(0);
    const isFirstPhoto = useRef(true);

    // Clock Tick
    useEffect(() => {
        if (!active) return;
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, [active]);

    // Simple Weather Fetch (Reusing logic lighter)
    useEffect(() => {
        if (!active || mode !== 'clock' || !config.weatherLocation) return;

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
    }, [active, mode, config.weatherLocation]);

    // Helper: build a shuffled play order for the slideshow
    const reshuffle = useCallback((count: number) => {
        const arr = Array.from({ length: count }, (_, i) => i);
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        photoOrderRef.current = arr;
    }, []);

    // Fetch photos when entering photo mode
    useEffect(() => {
        if (!active || mode !== 'photos') return;
        const url = config.screensaver?.photoAlbumUrl;
        if (!url) {
            setPhotoError('Kein iCloud-Album konfiguriert');
            return;
        }

        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch(`${getApiUrl()}/api/icloud/album?url=${encodeURIComponent(url)}`, {
                    headers: { 'x-device-id': deviceId }
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    const msg = data.details || data.error || `HTTP ${res.status}`;
                    throw new Error(msg);
                }
                const data = await res.json();
                if (cancelled) return;
                const list: IcloudPhoto[] = data.photos || [];
                setPhotos(list);
                setPhotoError(list.length ? null : 'Keine Fotos im Album');
                reshuffle(list.length);
                orderIndexRef.current = 0;
                isFirstPhoto.current = true;
            } catch (e) {
                if (cancelled) return;
                console.error('iCloud album load failed', e);
                setPhotoError(e instanceof Error ? e.message : 'Album konnte nicht geladen werden');
            }
        };
        load();

        // Re-fetch every 25 minutes so the signed URLs (≈1h TTL) stay fresh.
        const refresh = setInterval(load, 25 * 60 * 1000);
        return () => {
            cancelled = true;
            clearInterval(refresh);
        };
    }, [active, mode, config.screensaver?.photoAlbumUrl, deviceId, reshuffle]);

    // Show first photo immediately when photos load
    useEffect(() => {
        if (photos.length > 0 && isFirstPhoto.current) {
            isFirstPhoto.current = false;
            const firstIdx = photoOrderRef.current[0] ?? 0;
            setSlotA(photos[firstIdx]);
            setSlotB(null);
            setActiveSlot('a');
            setAnimating(false);
            orderIndexRef.current = 1;
        }
    }, [photos]);

    // Slideshow tick — advance with transition
    useEffect(() => {
        if (!active || mode !== 'photos' || photos.length < 2) return;
        const intervalSec = Math.max(3, config.screensaver?.photoIntervalSeconds || 10);
        const timer = setInterval(() => {
            let idx = orderIndexRef.current;
            if (idx >= photoOrderRef.current.length) {
                reshuffle(photos.length);
                idx = 0;
            }
            const nextPhoto = photos[photoOrderRef.current[idx] ?? 0];
            orderIndexRef.current = idx + 1;

            const effect = pickTransition(config.screensaver?.photoTransition);
            setTransition(effect);
            setAnimating(true);

            if (activeSlot === 'a') {
                setSlotB(nextPhoto);
                setActiveSlot('b');
            } else {
                setSlotA(nextPhoto);
                setActiveSlot('a');
            }

            // Clear animating flag after the longest animation duration (1.5s)
            setTimeout(() => setAnimating(false), 1600);
        }, intervalSec * 1000);
        return () => clearInterval(timer);
    }, [active, mode, photos, activeSlot, config.screensaver?.photoIntervalSeconds, config.screensaver?.photoTransition, reshuffle]);

    // Reset state when screensaver deactivates
    useEffect(() => {
        if (!active) {
            setSlotA(null);
            setSlotB(null);
            setActiveSlot('a');
            setAnimating(false);
            isFirstPhoto.current = true;
            orderIndexRef.current = 0;
        }
    }, [active]);

    if (!active) return null;

    if (mode === 'photos') {
        const currentPhoto = activeSlot === 'a' ? slotA : slotB;
        const needsPerspective = transition === 'flip';

        return (
            <div
                className="fixed inset-0 z-[9999] bg-black text-white cursor-none flex flex-col items-center justify-center select-none overflow-hidden"
                style={needsPerspective ? { perspective: '1200px' } : undefined}
                onClick={onDismiss}
                onTouchStart={onDismiss}
            >
                {/* Slot A */}
                {slotA && (
                    <img
                        key={`a-${slotA.id}`}
                        src={slotA.url}
                        alt=""
                        className={`absolute inset-0 w-full h-full object-contain ${
                            animating
                                ? activeSlot === 'a'
                                    ? ENTER_CLASS[transition]
                                    : EXIT_CLASS[transition]
                                : activeSlot === 'a'
                                    ? 'opacity-100'
                                    : 'opacity-0'
                        }`}
                        style={{ zIndex: activeSlot === 'a' ? 2 : 1 }}
                        draggable={false}
                    />
                )}

                {/* Slot B */}
                {slotB && (
                    <img
                        key={`b-${slotB.id}`}
                        src={slotB.url}
                        alt=""
                        className={`absolute inset-0 w-full h-full object-contain ${
                            animating
                                ? activeSlot === 'b'
                                    ? ENTER_CLASS[transition]
                                    : EXIT_CLASS[transition]
                                : activeSlot === 'b'
                                    ? 'opacity-100'
                                    : 'opacity-0'
                        }`}
                        style={{ zIndex: activeSlot === 'b' ? 2 : 1 }}
                        draggable={false}
                    />
                )}

                {/* Clock & date overlay */}
                {currentPhoto && (
                    <div className="absolute bottom-10 left-10 z-10 text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] pointer-events-none">
                        <div className="text-7xl font-black tabular-nums leading-none">
                            {format(time, 'HH:mm')}
                        </div>
                        <div className="text-xl font-light mt-2 opacity-90">
                            {format(time, 'EEEE, d. MMMM', { locale: de })}
                        </div>
                    </div>
                )}

                {/* Error / loading state */}
                {!currentPhoto && (
                    <div className="text-slate-500 text-2xl z-10">
                        {photoError || 'Lade Album\u2026'}
                    </div>
                )}

                {/* Hint */}
                <div className="absolute bottom-4 right-6 z-10 text-slate-500 text-xs">
                    Berühren zum Aufwecken
                </div>
            </div>
        );
    }

    // Default clock mode (night)
    return (
        <div
            className="fixed inset-0 z-[9999] bg-black text-white cursor-none flex flex-col items-center justify-center select-none"
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
