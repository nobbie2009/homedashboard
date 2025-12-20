import React, { useState } from 'react';
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

    // Cleanup old object URLs when imageSrc changes (optional optimization, but useEffect cleanup handles most)
    // Actually, the useEffect cleanup above revokes the URL when the effect re-runs (i.e. timestamp changes).
    // So we are safe.

    // Trigger next fetch when image is "loaded" (which for blob is immediate after set state?)
    // No, we want to control the frame rate.

    // Refresh Logic
    // We update the timestamp to trigger a re-render of the img tag, 
    // effectively requesting a new frame if it's a snapshot endpoint.
    // Use a Ref or just standard state?
    // If it's a STREAM, we don't need to refresh manually?
    // The previous code used /api/camera/snapshot?t=...
    // If we want a stream, we should point to /api/camera/stream?deviceId=...

    // Let's support both based on implied behavior or config?
    // The backend provides /stream and /snapshot. 
    // The current implementation seemed to rely on repeatedly fetching /snapshot.
    // Streaming (MJPEG) is much better for "Video".
    // Let's try to use the stream endpoint first! 
    // Stream URL: /api/camera/stream?deviceId=XXX

    // BUT: Does the backend support /stream? Yes, I saw it in index.js.
    // AND it supports the query param now.

    const streamUrl = config.cameraUrl
        ? `${API_URL}/api/camera/stream?deviceId=${deviceId}&t=${timestamp}`
        : '';

    // Watchdog / Error Handling for Stream
    // If the stream breaks (image fails to load), we increment error and try to re-mount (update timestamp)

    const handleError = () => {
        console.warn("Camera stream failed/stopped, retrying...");
        setErrorCount(prev => prev + 1);
        // Wait 2s then retry
        setTimeout(() => setTimestamp(Date.now()), 2000);
    };

    const handleLoad = () => {
        setErrorCount(0);
    };

    // If no URL is configured
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
            {streamUrl && (
                <img
                    src={streamUrl}
                    alt="Camera Live Stream"
                    className="w-full h-full object-cover"
                    onLoad={handleLoad}
                    onError={handleError}
                />
            )}

            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="text-xs text-white/80 font-medium ml-1">
                    Live Stream {errorCount > 0 && <span className="text-red-400">({errorCount} Restarts)</span>}
                </span>
            </div>
        </div>
    );
};
