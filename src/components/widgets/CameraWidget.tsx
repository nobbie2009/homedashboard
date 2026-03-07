import React, { useState, useEffect, useRef } from 'react';
import { VideoOff } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { getApiUrl } from '../../utils/api';
import { useSecurity } from '../../contexts/SecurityContext';

const SNAPSHOT_INTERVAL = 250;
const ERROR_RETRY_DELAY = 2000;
const STREAM_TIMEOUT = 5000; // 5s timeout for MJPEG stream to produce a frame

export const CameraWidget: React.FC = () => {
    const { config } = useConfig();
    const { deviceId } = useSecurity();
    const API_URL = getApiUrl();
    const [useStream, setUseStream] = useState(true);
    const [errorCount, setErrorCount] = useState(0);
    const [snapshotTimestamp, setSnapshotTimestamp] = useState(Date.now());
    const [streamLoaded, setStreamLoaded] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

    const streamUrl = `${API_URL}/api/camera/stream?deviceId=${deviceId}`;
    const snapshotUrl = `${API_URL}/api/camera/snapshot?deviceId=${deviceId}&t=${snapshotTimestamp}`;

    // Reset on config change
    useEffect(() => {
        setUseStream(true);
        setStreamLoaded(false);
        setErrorCount(0);
    }, [config.cameraUrl, deviceId]);

    // Timeout: if MJPEG stream doesn't load within STREAM_TIMEOUT, fall back to snapshots
    useEffect(() => {
        if (useStream && !streamLoaded) {
            timeoutRef.current = setTimeout(() => {
                console.warn("MJPEG stream timeout, falling back to snapshot polling");
                setUseStream(false);
                setSnapshotTimestamp(Date.now());
            }, STREAM_TIMEOUT);
        }
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [useStream, streamLoaded]);

    // Snapshot polling fallback handlers
    const handleSnapshotLoad = () => {
        setErrorCount(0);
        setTimeout(() => setSnapshotTimestamp(Date.now()), SNAPSHOT_INTERVAL);
    };

    const handleSnapshotError = () => {
        setErrorCount(prev => prev + 1);
        setTimeout(() => setSnapshotTimestamp(Date.now()), ERROR_RETRY_DELAY);
    };

    const handleStreamLoad = () => {
        setStreamLoaded(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };

    const handleStreamError = () => {
        console.warn("MJPEG stream failed, falling back to snapshot polling");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setUseStream(false);
        setSnapshotTimestamp(Date.now());
    };

    if (!config.cameraUrl) {
        return (
            <div className="h-full bg-slate-200/20 dark:bg-slate-800/20 rounded-xl border border-slate-300/30 dark:border-slate-700/30 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600">
                <VideoOff className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-sm italic">Keine Kamera konfiguriert</span>
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-black rounded-xl overflow-hidden relative group border border-slate-200 dark:border-slate-800">
            {useStream ? (
                <img
                    ref={imgRef}
                    src={streamUrl}
                    alt="Camera Live Stream"
                    className="w-full h-full object-cover"
                    onLoad={handleStreamLoad}
                    onError={handleStreamError}
                />
            ) : (
                <img
                    src={snapshotUrl}
                    alt="Camera Snapshot"
                    className="w-full h-full object-cover"
                    onLoad={handleSnapshotLoad}
                    onError={handleSnapshotError}
                />
            )}

            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="text-xs text-white/80 font-medium ml-1">
                    {useStream ? 'Live Stream' : 'Snapshot'} {errorCount > 0 && <span className="text-red-400">({errorCount} Fehler)</span>}
                </span>
            </div>
        </div>
    );
};
