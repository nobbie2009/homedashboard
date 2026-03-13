import React, { useState, useEffect, useCallback } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Music } from 'lucide-react';
import { getApiUrl } from '../../utils/api';
import { useSecurity } from '../../contexts/SecurityContext';

interface SonosTrack {
    title: string;
    artist: string;
    album: string;
    albumArtURI: string;
}

interface SonosSpeaker {
    ip: string;
    name: string;
    state: string;
    volume: number;
    muted: boolean;
    currentTrack: SonosTrack | null;
}

const POLL_INTERVAL = 5000;

export const SonosWidget: React.FC = () => {
    const { deviceId } = useSecurity();
    const [speakers, setSpeakers] = useState<SonosSpeaker[]>([]);
    const [activeSpeaker, setActiveSpeaker] = useState<SonosSpeaker | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const headers = { 'x-device-id': deviceId, 'Content-Type': 'application/json' };
    const apiUrl = getApiUrl();

    const fetchSpeakers = useCallback(async () => {
        try {
            const res = await fetch(`${apiUrl}/api/sonos/speakers`, { headers });
            if (!res.ok) throw new Error();
            const data: SonosSpeaker[] = await res.json();
            setSpeakers(data);
            setError(false);

            // Pick active speaker: prefer one that's playing, else first
            const playing = data.find(s => s.state === 'playing');
            const current = playing || data[0] || null;
            setActiveSpeaker(current);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [apiUrl, deviceId]);

    // Poll for updates when active
    useEffect(() => {
        fetchSpeakers();
        const interval = setInterval(async () => {
            if (!activeSpeaker) return;
            try {
                const res = await fetch(`${apiUrl}/api/sonos/state?ip=${activeSpeaker.ip}`, { headers });
                if (res.ok) {
                    const state = await res.json();
                    setActiveSpeaker(prev => prev ? { ...prev, ...state } : null);
                }
            } catch { /* ignore */ }
        }, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [activeSpeaker?.ip]);

    const sendCommand = async (action: string, body?: Record<string, unknown>) => {
        if (!activeSpeaker) return;
        try {
            await fetch(`${apiUrl}/api/sonos/${action}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ ip: activeSpeaker.ip, ...body }),
            });
            // Refresh state
            const res = await fetch(`${apiUrl}/api/sonos/state?ip=${activeSpeaker.ip}`, { headers });
            if (res.ok) {
                const state = await res.json();
                setActiveSpeaker(prev => prev ? { ...prev, ...state } : null);
            }
        } catch { /* ignore */ }
    };

    const isPlaying = activeSpeaker?.state === 'playing';
    const track = activeSpeaker?.currentTrack;

    if (loading) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 h-full flex items-center justify-center border border-slate-200 dark:border-slate-800">
                <div className="animate-pulse text-slate-400 text-sm">Sonos wird gesucht...</div>
            </div>
        );
    }

    if (error || !activeSpeaker) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 h-full flex items-center justify-center border border-slate-200 dark:border-slate-800">
                <div className="text-center">
                    <Music className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-1" />
                    <div className="text-xs text-slate-400">Kein Sonos gefunden</div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 h-full flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Header with speaker name */}
            <div className="flex items-center justify-between mb-1 flex-none">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
                    {activeSpeaker.name}
                </div>
                {speakers.length > 1 && (
                    <div className="text-[10px] text-slate-400 dark:text-slate-500">
                        {speakers.length} Speaker
                    </div>
                )}
            </div>

            {/* Track info */}
            <div className="flex items-center gap-2 flex-1 min-h-0">
                {track?.albumArtURI ? (
                    <img
                        src={track.albumArtURI}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover flex-none"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                ) : (
                    <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-none">
                        <Music className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {track?.title || 'Keine Wiedergabe'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {track?.artist || ''}
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between mt-2 flex-none">
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => sendCommand('previous')}
                        className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <SkipBack className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </button>
                    <button
                        onClick={() => sendCommand(isPlaying ? 'pause' : 'play')}
                        className="p-2 rounded-full bg-blue-500 hover:bg-blue-600 transition-colors"
                    >
                        {isPlaying ? (
                            <Pause className="w-5 h-5 text-white" fill="white" />
                        ) : (
                            <Play className="w-5 h-5 text-white" fill="white" />
                        )}
                    </button>
                    <button
                        onClick={() => sendCommand('next')}
                        className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <SkipForward className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                    </button>
                </div>

                <button
                    onClick={() => sendCommand('mute', { muted: !activeSpeaker.muted })}
                    className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                    {activeSpeaker.muted ? (
                        <VolumeX className="w-4 h-4 text-red-400" />
                    ) : (
                        <Volume2 className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    )}
                </button>
            </div>
        </div>
    );
};
