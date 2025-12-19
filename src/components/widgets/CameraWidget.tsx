import React, { useState, useEffect } from 'react';
import { VideoOff, RefreshCw } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { getApiUrl } from '../../utils/api';

export const CameraWidget: React.FC = () => {
    const { config } = useConfig();
    const [imageUrl, setImageUrl] = useState<string>('');
    const API_URL = getApiUrl();

    useEffect(() => {
        if (!config.cameraUrl) return;

        // Function to update the image
        const fetchSnapshot = () => {
            const timestamp = new Date().getTime();
            setImageUrl(`${API_URL}/api/camera/snapshot?t=${timestamp}`);
        };

        // Initial fetch
        fetchSnapshot();

        // Poll every 1 second for near-live updates
        const interval = setInterval(fetchSnapshot, 1000);

        return () => clearInterval(interval);
    }, [config.cameraUrl, API_URL]);

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
            {imageUrl ? (
                <img
                    src={imageUrl}
                    alt="Camera Live"
                    className="w-full h-full object-cover"
                    onError={() => console.error("Snapshot load failed")}
                />
            ) : (
                <div className="flex items-center justify-center h-full text-slate-500 text-xs">Lade Kamera...</div>
            )}

            {/* Overlay Title */}
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="text-xs text-white/80 font-medium ml-1">Live Kamera (Snapshot)</span>
            </div>
        </div>
    );
};
