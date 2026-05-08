import React, { useEffect, useRef, useState } from 'react';
import { X, Bell, VideoOff } from 'lucide-react';
import { getApiUrl } from '../../utils/api';
import { useSecurity } from '../../contexts/SecurityContext';

interface DoorbellOverlayProps {
    active: boolean;
    onClose: () => void;
    eventTimestamp?: number;
}

const AUTO_CLOSE_MS = 30000;
const SNAPSHOT_REFRESH_MS = 1500;
const STREAM_KICKIN_MS = 2500;

export const DoorbellOverlay: React.FC<DoorbellOverlayProps> = ({ active, onClose, eventTimestamp }) => {
    const [visible, setVisible] = useState(false);
    const [snapshotTs, setSnapshotTs] = useState<number>(Date.now());
    const [showStream, setShowStream] = useState(false);
    const [streamFailed, setStreamFailed] = useState(false);
    const { deviceId } = useSecurity();
    const API_URL = getApiUrl();
    const refreshTimer = useRef<ReturnType<typeof setTimeout>>();
    const streamTimer = useRef<ReturnType<typeof setTimeout>>();
    const closeTimer = useRef<ReturnType<typeof setTimeout>>();

    useEffect(() => {
        if (!active) {
            // Fade out then hide
            const t = setTimeout(() => setVisible(false), 300);
            return () => clearTimeout(t);
        }

        setVisible(true);
        setShowStream(false);
        setStreamFailed(false);
        setSnapshotTs(eventTimestamp || Date.now());

        // Refresh the snapshot a few times during the first seconds
        // so the displayed frame matches the moment of ringing.
        let refreshes = 0;
        const tick = () => {
            refreshes += 1;
            setSnapshotTs(Date.now());
            if (refreshes < 3) {
                refreshTimer.current = setTimeout(tick, SNAPSHOT_REFRESH_MS);
            }
        };
        refreshTimer.current = setTimeout(tick, SNAPSHOT_REFRESH_MS);

        // After a short delay try to switch to the live MJPEG stream.
        streamTimer.current = setTimeout(() => setShowStream(true), STREAM_KICKIN_MS);

        // Auto close
        closeTimer.current = setTimeout(onClose, AUTO_CLOSE_MS);

        return () => {
            if (refreshTimer.current) clearTimeout(refreshTimer.current);
            if (streamTimer.current) clearTimeout(streamTimer.current);
            if (closeTimer.current) clearTimeout(closeTimer.current);
        };
    }, [active, eventTimestamp, onClose]);

    if (!visible) return null;

    const snapshotUrl = `${API_URL}/api/doorbell/snapshot?deviceId=${deviceId}&t=${snapshotTs}`;
    const streamUrl = `${API_URL}/api/doorbell/stream?deviceId=${deviceId}`;
    const useStream = showStream && !streamFailed;

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-0'}`}
            onClick={onClose}
        >
            <div
                className={`bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-700 w-[90vw] h-[80vh] relative transform transition-all duration-300 ${active ? 'scale-100 translate-y-0' : 'scale-95 translate-y-10'}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-start pointer-events-none">
                    <div className="flex items-center space-x-2 bg-red-600/90 text-white px-4 py-2 rounded-full backdrop-blur-md shadow-lg animate-pulse">
                        <Bell className="w-5 h-5" />
                        <span className="font-bold">Es hat geklingelt!</span>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 bg-white/10 hover:bg-red-600 rounded-full text-white backdrop-blur-md transition-colors pointer-events-auto"
                    >
                        <X className="w-8 h-8" />
                    </button>
                </div>

                {/* Image area: snapshot first (instant), then live stream */}
                <div className="w-full h-full bg-black relative">
                    {/* Snapshot — always rendered so we have an instant frame
                        even if the live stream takes a moment to come up. */}
                    <img
                        src={snapshotUrl}
                        alt="Türklingel Snapshot"
                        className={`w-full h-full object-contain transition-opacity duration-300 ${useStream ? 'opacity-0' : 'opacity-100'}`}
                        onError={() => {
                            // Retry once
                            setTimeout(() => setSnapshotTs(Date.now()), 1000);
                        }}
                    />

                    {useStream && (
                        <img
                            src={streamUrl}
                            alt="Türklingel Live"
                            className="absolute inset-0 w-full h-full object-contain"
                            onError={() => setStreamFailed(true)}
                        />
                    )}

                    {streamFailed && (
                        <div className="absolute bottom-4 left-4 flex items-center space-x-2 text-white/70 bg-black/40 rounded-full px-3 py-1 text-xs">
                            <VideoOff className="w-4 h-4" />
                            <span>Live-Stream nicht verfügbar — zeige Snapshot</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
