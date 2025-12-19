import React, { useState } from 'react';
import { VideoOff, RefreshCw } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { getApiUrl } from '../../utils/api';

export const CameraWidget: React.FC = () => {
    const { config } = useConfig();
    const [error, setError] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    // const API_URL = getApiUrl();

    // If no URL is configured, show placeholder
    if (!config.cameraUrl) {
        return (
            <div className="h-full bg-slate-800/20 rounded-xl border border-slate-700/30 flex flex-col items-center justify-center text-slate-600">
                <VideoOff className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-sm italic">Keine Kamera konfiguriert</span>
            </div>
        );
    }

    // Force direct connection to backend (bypass Nginx) for less latency/buffering issues
    // Assumes backend is always on port 3001 as defined in docker-compose
    const directApiUrl = `http://${window.location.hostname}:3001`;
    const streamUrl = `${directApiUrl}/api/camera/stream?t=${refreshKey}`;

    const handleRetry = () => {
        setError(false);
        setRefreshKey(prev => prev + 1);
    };

    return (
        <div className="h-full w-full bg-black rounded-xl overflow-hidden relative group border border-slate-800">
            {error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/80 text-slate-400">
                    <VideoOff className="w-8 h-8 mb-2" />
                    <span className="text-sm mb-3">Stream nicht verfügbar</span>
                    <button
                        onClick={handleRetry}
                        className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition"
                    >
                        <RefreshCw className="w-3 h-3" />
                        <span>Neu verbinden</span>
                    </button>
                </div>
            ) : (
                <img
                    src={streamUrl}
                    alt="Camera Stream"
                    className="w-full h-full object-cover"
                    onError={() => setError(true)}
                />
            )}

            {/* Overlay Title (Optional) */}
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="text-xs text-white/80 font-medium ml-1">Live Kamera</span>
            </div>
        </div>
    );
};
