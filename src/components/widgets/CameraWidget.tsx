import React, { useState, useEffect } from 'react';
import { VideoOff } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { getApiUrl } from '../../utils/api';

export const CameraWidget: React.FC = () => {
    const { config } = useConfig();
    const [timestamp, setTimestamp] = useState<number>(Date.now());
    const API_URL = getApiUrl();
    const [errorCount, setErrorCount] = useState(0);

    // Determines the refresh URL
    // We append a timestamp to bust browser cache
    const imageUrl = config.cameraUrl
        ? `${API_URL}/api/camera/snapshot?t=${timestamp}`
        : '';

    // Called when image successfully loads
    const handleLoad = () => {
        // Reset error count on success
        setErrorCount(0);
        // Schedule next fetch after a short delay (e.g. 250ms) to allow "breathing room"
        // This ensures acceptable frame rate without flooding the server
        setTimeout(() => {
            setTimestamp(Date.now());
        }, 250);
    };

    // Called when image fails to load
    const handleError = () => {
        console.warn("Camera snapshot failed, retrying...");
        setErrorCount(prev => prev + 1);

        // Exponential backoff or fixed slower retry
        // If we fail, wait longer (e.g. 2s) before trying again
        setTimeout(() => {
            setTimestamp(Date.now());
        }, 2000);
    };

    // Initial trigger or config change reset
    useEffect(() => {
        setTimestamp(Date.now());
    }, [config.cameraUrl]);

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
            {imageUrl && (
                <img
                    src={imageUrl}
                    alt="Camera Live"
                    className="w-full h-full object-cover"
                    onLoad={handleLoad}
                    onError={handleError}
                />
            )}

            {/* Overlay for loading state if needed, though usually we just keep showing the old image until new one loads */}

            {/* Overlay Title */}
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="text-xs text-white/80 font-medium ml-1">
                    Live Kamera {errorCount > 0 && <span className="text-red-400">({errorCount} Fehleinschläge)</span>}
                </span>
            </div>
        </div>
    );
};
