import React, { useState, useEffect } from 'react';
import { VideoOff } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { getApiUrl } from '../../utils/api';

import { useSecurity } from '../../contexts/SecurityContext';

export const CameraWidget: React.FC = () => {
    const { config } = useConfig();
    const { deviceId } = useSecurity();
    const [timestamp, setTimestamp] = useState<number>(Date.now());
    const API_URL = getApiUrl();
    const [errorCount, setErrorCount] = useState(0);
    const [imageSrc, setImageSrc] = useState<string>('');

    // Cleanup old object URLs when imageSrc changes (optional optimization, but useEffect cleanup handles most)
    // Actually, the useEffect cleanup above revokes the URL when the effect re-runs (i.e. timestamp changes).
    // So we are safe.

    // Trigger next fetch when image is "loaded" (which for blob is immediate after set state?)
    // No, we want to control the frame rate.
    // Since we fetch manually, we know when it's done. 
    // BUT we should wait for the *previous* fetch to finish before scheduling the next one?
    // The useEffect replaces reliance on `onLoad` of the img tag for *network* timing, 
    // but we can just schedule the next timestamp update after the fetch is done.

    // Changing the logic:
    // instead of useEffect [timestamp], we can have a loop that runs.
    // OR we keep useEffect [timestamp] but trigger the next timestamp change *inside* the fetch success.

    // Let's refine the useEffect above. 
    // Calling setTimestamp inside useEffect[timestamp] creates an infinite loop if we aren't careful, 
    // but with setTimeout it's fine.

    // Fetch the image blob manually to include the header
    // Use a loop driven by timestamp updates to control framerate
    useEffect(() => {
        if (!config.cameraUrl || !deviceId) return;

        let active = true;

        const fetchImage = async () => {
            try {
                const res = await fetch(`${API_URL}/api/camera/snapshot?t=${Date.now()}`, {
                    headers: { 'x-device-id': deviceId }
                });

                if (!res.ok) throw new Error("Status " + res.status);

                const blob = await res.blob();
                if (!active) return;

                const newUrl = URL.createObjectURL(blob);

                setImageSrc(prev => {
                    if (prev) URL.revokeObjectURL(prev);
                    return newUrl;
                });

                setErrorCount(0);

                // Schedule next
                setTimeout(() => {
                    if (active) setTimestamp(Date.now());
                }, 250);

            } catch (err) {
                console.warn("Camera snapshot failed", err);
                if (active) {
                    setErrorCount(prev => prev + 1);
                    // Longer wait on error
                    setTimeout(() => {
                        if (active) setTimestamp(Date.now());
                    }, 2000);
                }
            }
        };

        fetchImage();

        return () => {
            active = false;
        };
    }, [timestamp, config.cameraUrl, deviceId]);
    // Note: 'timestamp' dependency triggers the effect. The effect schedules the change of 'timestamp'. This replaces the interval/onLoad loop.

    // Watchdog
    useEffect(() => {
        const watchdog = setInterval(() => {
            const timeSinceLastFetch = Date.now() - timestamp;
            if (timeSinceLastFetch > 5000) {
                console.log("Watchdog: Camera update stuck, forcing refresh...");
                setTimestamp(Date.now());
            }
        }, 2000);
        return () => clearInterval(watchdog);
    }, [timestamp]);

    // If no URL is configured, show placeholder
    if (!config.cameraUrl) {
        return (
            <div className="h-full bg-slate-800/20 rounded-xl border border-slate-700/30 flex flex-col items-center justify-center text-slate-600">
                <VideoOff className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-sm italic">Keine Kamera konfiguriert</span>
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-black rounded-xl overflow-hidden relative group border border-slate-800">
            {imageSrc && (
                <img
                    src={imageSrc}
                    alt="Camera Live"
                    className="w-full h-full object-cover"
                />
            )}

            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="text-xs text-white/80 font-medium ml-1">
                    Live Kamera {errorCount > 0 && <span className="text-red-400">({errorCount} Errors)</span>}
                </span>
            </div>
        </div>
    );
};
