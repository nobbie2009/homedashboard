import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
    Music, ListMusic, Search, Shuffle, Repeat, Smartphone, Speaker,
    Plus, ChevronRight, Disc3, Keyboard
} from 'lucide-react';
import { getApiUrl } from '../../utils/api';
import { useSecurity } from '../../contexts/SecurityContext';
import { OnScreenKeyboard } from '../../components/overlays/OnScreenKeyboard';

// --- Interfaces ---

interface SpotifyArtist {
    name: string;
}

interface SpotifyAlbum {
    name: string;
    images: { url: string }[];
}

interface SpotifyTrack {
    id: string;
    name: string;
    uri: string;
    artists: SpotifyArtist[];
    album: SpotifyAlbum;
    duration_ms: number;
}

interface SpotifyDevice {
    id: string;
    name: string;
    type: string;
    is_active: boolean;
    volume_percent: number;
    source?: 'spotify' | 'sonos';
    ip?: string;
}

interface SpotifyPlaylist {
    id: string;
    name: string;
    images: { url: string }[];
    tracks: { total: number };
    uri: string;
}

interface SpotifyPlayerState {
    is_playing: boolean;
    item: SpotifyTrack | null;
    progress_ms: number;
    device: { id: string; name: string; volume_percent: number } | null;
    shuffle_state: boolean;
    repeat_state: 'off' | 'track' | 'context';
}

interface SpotifyQueueResponse {
    currently_playing: SpotifyTrack | null;
    queue: SpotifyTrack[];
}

type Tab = 'player' | 'search' | 'playlists' | 'queue' | 'devices';

const STATE_POLL_MS = 3000;

const SpotifyView: React.FC = () => {
    const { deviceId } = useSecurity();
    const [playerState, setPlayerState] = useState<SpotifyPlayerState | null>(null);
    const [devices, setDevices] = useState<SpotifyDevice[]>([]);
    const [activeTab, setActiveTab] = useState<Tab>('player');
    const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
    const [playlistTracks, setPlaylistTracks] = useState<SpotifyTrack[]>([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState<SpotifyPlaylist | null>(null);
    const [queueData, setQueueData] = useState<SpotifyQueueResponse | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [localVolume, setLocalVolume] = useState<number | null>(null);
    const [activeSonos, setActiveSonos] = useState<{ ip: string; id: string; name: string } | null>(null);
    const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

    const headers: Record<string, string> = { 'x-device-id': deviceId, 'Content-Type': 'application/json' };
    const apiUrl = getApiUrl();

    // --- Helpers ---

    const formatMs = (ms: number) => {
        if (!ms || ms < 0) return '0:00';
        const totalSeconds = Math.floor(ms / 1000);
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const getAlbumArt = (track: SpotifyTrack | null | undefined): string | null => {
        return track?.album?.images?.[0]?.url ?? null;
    };

    const getArtistNames = (track: SpotifyTrack | null | undefined): string => {
        return track?.artists?.map(a => a.name).join(', ') ?? '';
    };

    // --- Data Fetching ---

    const fetchPlayerState = useCallback(async () => {
        try {
            const res = await fetch(`${apiUrl}/api/spotify/player`, { headers });
            if (res.ok) {
                const data: SpotifyPlayerState = await res.json();
                setPlayerState(data);
                if (localVolume === null && data.device) {
                    setLocalVolume(data.device.volume_percent);
                }
            }
        } catch { /* ignore */ }
        finally {
            setLoading(false);
        }
    }, [apiUrl, deviceId]);

    const fetchDevices = useCallback(async () => {
        try {
            const res = await fetch(`${apiUrl}/api/spotify/devices`, { headers });
            if (res.ok) {
                const data = await res.json();
                setDevices(data.devices || []);
            }
        } catch { /* ignore */ }
    }, [apiUrl, deviceId]);

    // Initial load
    useEffect(() => {
        fetchPlayerState();
        fetchDevices();
    }, []);

    // Poll player state
    useEffect(() => {
        const interval = setInterval(fetchPlayerState, STATE_POLL_MS);
        return () => clearInterval(interval);
    }, [fetchPlayerState]);

    // Load tab data when switching
    useEffect(() => {
        if (activeTab === 'playlists' && playlists.length === 0) {
            fetch(`${apiUrl}/api/spotify/playlists`, { headers })
                .then(r => r.ok ? r.json() : { items: [] })
                .then(data => setPlaylists(data.items || []));
        } else if (activeTab === 'queue') {
            fetch(`${apiUrl}/api/spotify/queue`, { headers })
                .then(r => r.ok ? r.json() : null)
                .then(setQueueData);
        } else if (activeTab === 'devices') {
            fetchDevices();
        }
    }, [activeTab]);

    // --- Commands ---

    const spotifyPut = async (endpoint: string, body?: Record<string, unknown>) => {
        try {
            await fetch(`${apiUrl}/api/spotify/${endpoint}`, {
                method: 'PUT',
                headers,
                body: body ? JSON.stringify(body) : undefined,
            });
            setTimeout(fetchPlayerState, 500);
        } catch { /* ignore */ }
    };

    const spotifyPost = async (endpoint: string, body?: Record<string, unknown>) => {
        try {
            await fetch(`${apiUrl}/api/spotify/${endpoint}`, {
                method: 'POST',
                headers,
                body: body ? JSON.stringify(body) : undefined,
            });
            setTimeout(fetchPlayerState, 500);
        } catch { /* ignore */ }
    };

    const sonosPut = async (endpoint: string, body: Record<string, unknown>) => {
        try {
            await fetch(`${apiUrl}/api/spotify/sonos/${endpoint}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(body),
            });
        } catch { /* ignore */ }
    };

    const sonosPost = async (endpoint: string, body: Record<string, unknown>) => {
        try {
            await fetch(`${apiUrl}/api/spotify/sonos/${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
        } catch { /* ignore */ }
    };

    const handlePlayPause = () => {
        if (activeSonos) {
            if (playerState?.is_playing) {
                sonosPut('pause', { ip: activeSonos.ip });
            } else {
                sonosPut('play', { ip: activeSonos.ip });
            }
        } else if (playerState?.is_playing) {
            spotifyPut('pause');
        } else {
            spotifyPut('play');
        }
    };

    const handleNext = () => {
        if (activeSonos) {
            sonosPost('next', { ip: activeSonos.ip });
        } else {
            spotifyPost('next');
        }
    };

    const handlePrevious = () => {
        if (activeSonos) {
            sonosPost('previous', { ip: activeSonos.ip });
        } else {
            spotifyPost('previous');
        }
    };

    const handleVolumeChange = (vol: number) => {
        setLocalVolume(vol);
        if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
        volumeTimeoutRef.current = setTimeout(() => {
            if (activeSonos) {
                sonosPut('volume', { ip: activeSonos.ip, volume_percent: vol });
            } else {
                spotifyPut('volume', { volume_percent: vol });
            }
        }, 200);
    };

    const handleShuffle = () => {
        if (!activeSonos) {
            spotifyPut('shuffle', { state: !playerState?.shuffle_state });
        }
    };

    const handleRepeat = () => {
        if (!activeSonos) {
            const current = playerState?.repeat_state || 'off';
            const next = current === 'off' ? 'context' : current === 'context' ? 'track' : 'off';
            spotifyPut('repeat', { state: next });
        }
    };

    const playTrack = (uri: string) => {
        if (activeSonos) {
            sonosPut('play', { ip: activeSonos.ip, uris: [uri] });
        } else {
            spotifyPut('play', { uris: [uri] });
        }
    };

    const addToQueue = (uri: string) => {
        if (activeSonos) {
            sonosPut('play', { ip: activeSonos.ip, uri });
        } else {
            spotifyPost('queue', { uri });
        }
    };

    const playPlaylist = (playlistUri: string) => {
        if (activeSonos) {
            sonosPut('play', { ip: activeSonos.ip, context_uri: playlistUri });
        } else {
            spotifyPut('play', { context_uri: playlistUri });
        }
    };

    const transferPlayback = (targetDeviceId: string) => {
        spotifyPut('play', { device_id: targetDeviceId });
    };

    const selectSonosDevice = (device: SpotifyDevice) => {
        if (activeSonos?.id === device.id) {
            setActiveSonos(null);
        } else {
            setActiveSonos({ ip: device.ip!, id: device.id, name: device.name });
            setLocalVolume(device.volume_percent);
        }
    };

    const loadPlaylistTracks = async (playlist: SpotifyPlaylist) => {
        setSelectedPlaylist(playlist);
        try {
            const res = await fetch(`${apiUrl}/api/spotify/playlist/${playlist.id}/tracks`, { headers });
            if (res.ok) {
                const data = await res.json();
                setPlaylistTracks((data.items || []).map((i: { track: SpotifyTrack }) => i.track).filter(Boolean));
            }
        } catch { /* ignore */ }
    };

    const doSearch = async () => {
        if (!searchTerm.trim()) return;
        try {
            const res = await fetch(
                `${apiUrl}/api/spotify/search?q=${encodeURIComponent(searchTerm)}&type=track`,
                { headers }
            );
            if (res.ok) {
                const data = await res.json();
                setSearchResults(data.tracks?.items || []);
            }
        } catch { /* ignore */ }
    };

    // --- Derived state ---

    const isPlaying = playerState?.is_playing ?? false;
    const currentTrack = playerState?.item ?? null;
    const progressMs = playerState?.progress_ms ?? 0;
    const durationMs = currentTrack?.duration_ms ?? 0;
    const volumePercent = localVolume ?? playerState?.device?.volume_percent ?? 0;

    // --- Render ---

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <Disc3 className="w-12 h-12 text-green-400 animate-spin mx-auto mb-3" />
                    <div className="text-slate-500 dark:text-slate-400">Spotify wird geladen...</div>
                </div>
            </div>
        );
    }

    const tabs: { id: Tab; icon: React.ElementType; label: string }[] = [
        { id: 'player', icon: Music, label: 'Player' },
        { id: 'search', icon: Search, label: 'Suche' },
        { id: 'playlists', icon: ListMusic, label: 'Playlists' },
        { id: 'queue', icon: ListMusic, label: 'Warteschlange' },
        { id: 'devices', icon: Smartphone, label: 'Geräte' },
    ];

    return (
        <div className="h-full flex flex-col gap-4 overflow-hidden">
            {/* Main content area */}
            <div className="flex-1 grid grid-cols-[1fr_2fr] gap-4 min-h-0">
                {/* Left: Now Playing + Controls */}
                <div className="widget-card bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 flex flex-col overflow-y-auto custom-scrollbar">
                    {/* Album Art */}
                    <div className="flex-none mb-4">
                        {getAlbumArt(currentTrack) ? (
                            <img
                                src={getAlbumArt(currentTrack)!}
                                alt=""
                                className="w-full aspect-square rounded-xl object-cover shadow-lg"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                        ) : (
                            <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center">
                                <Music className="w-16 h-16 text-slate-300 dark:text-slate-600" />
                            </div>
                        )}
                    </div>

                    {/* Track Info */}
                    <div className="flex-none mb-4 text-center">
                        <div className="text-lg font-bold text-slate-800 dark:text-slate-100 truncate">
                            {currentTrack?.name || 'Keine Wiedergabe'}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
                            {getArtistNames(currentTrack)}
                        </div>
                        {currentTrack?.album?.name && (
                            <div className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                                {currentTrack.album.name}
                            </div>
                        )}
                    </div>

                    {/* Progress bar */}
                    {currentTrack && durationMs > 0 && (
                        <div className="flex-none mb-4">
                            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                                <div
                                    className="bg-green-500 h-1.5 rounded-full transition-all"
                                    style={{ width: `${Math.min(100, (progressMs / durationMs) * 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                <span>{formatMs(progressMs)}</span>
                                <span>{formatMs(durationMs)}</span>
                            </div>
                        </div>
                    )}

                    {/* Shuffle / Transport Controls / Repeat */}
                    <div className="flex items-center justify-center gap-3 flex-none mb-4">
                        <button
                            onClick={handleShuffle}
                            className={`p-2 rounded-full transition-colors ${
                                playerState?.shuffle_state
                                    ? 'text-green-500 bg-green-500/10'
                                    : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                            title="Zufallswiedergabe"
                        >
                            <Shuffle className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handlePrevious}
                            className="p-3 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <SkipBack className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                        </button>
                        <button
                            onClick={handlePlayPause}
                            className="p-4 rounded-full bg-green-500 hover:bg-green-600 transition-colors shadow-lg"
                        >
                            {isPlaying ? (
                                <Pause className="w-8 h-8 text-white" fill="white" />
                            ) : (
                                <Play className="w-8 h-8 text-white" fill="white" />
                            )}
                        </button>
                        <button
                            onClick={handleNext}
                            className="p-3 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <SkipForward className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                        </button>
                        <button
                            onClick={handleRepeat}
                            className={`p-2 rounded-full transition-colors relative ${
                                playerState?.repeat_state !== 'off'
                                    ? 'text-green-500 bg-green-500/10'
                                    : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                            title={`Wiederholen: ${playerState?.repeat_state || 'off'}`}
                        >
                            <Repeat className="w-5 h-5" />
                            {playerState?.repeat_state === 'track' && (
                                <span className="absolute -top-0.5 -right-0.5 text-[8px] font-bold text-green-500">1</span>
                            )}
                        </button>
                    </div>

                    {/* Volume */}
                    <div className="flex items-center gap-3 flex-none mb-3">
                        <button
                            onClick={() => handleVolumeChange(volumePercent > 0 ? 0 : 50)}
                            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            {volumePercent === 0 ? (
                                <VolumeX className="w-5 h-5 text-red-400" />
                            ) : (
                                <Volume2 className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            )}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={volumePercent}
                            onChange={e => handleVolumeChange(parseInt(e.target.value))}
                            className="flex-1 accent-green-500 h-2"
                        />
                        <span className="text-xs text-slate-400 w-8 text-right">
                            {volumePercent}%
                        </span>
                    </div>

                    {/* Current device */}
                    {(activeSonos || playerState?.device) && (
                        <div className="flex-none text-center">
                            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
                                {activeSonos ? (
                                    <>
                                        <Speaker className="w-3.5 h-3.5 text-green-500" />
                                        <span className="text-green-500">{activeSonos.name} (Sonos)</span>
                                    </>
                                ) : (
                                    <>
                                        <Smartphone className="w-3.5 h-3.5" />
                                        <span>{playerState!.device!.name}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Tabbed content */}
                <div className="widget-card bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden min-h-0">
                    {/* Tab bar */}
                    <div className="flex border-b border-slate-200 dark:border-slate-800 flex-none">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                                    activeTab === tab.id
                                        ? 'text-green-600 dark:text-green-400 border-b-2 border-green-500'
                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                        {activeTab === 'player' && (
                            <PlayerTab playerState={playerState} currentTrack={currentTrack} />
                        )}
                        {activeTab === 'search' && (
                            <SearchTab
                                searchTerm={searchTerm}
                                setSearchTerm={setSearchTerm}
                                results={searchResults}
                                onSearch={doSearch}
                                onPlay={playTrack}
                                onAddToQueue={addToQueue}
                            />
                        )}
                        {activeTab === 'playlists' && (
                            <PlaylistsTab
                                playlists={playlists}
                                selectedPlaylist={selectedPlaylist}
                                playlistTracks={playlistTracks}
                                onSelectPlaylist={loadPlaylistTracks}
                                onBack={() => { setSelectedPlaylist(null); setPlaylistTracks([]); }}
                                onPlayPlaylist={playPlaylist}
                                onPlayTrack={playTrack}
                                onAddToQueue={addToQueue}
                            />
                        )}
                        {activeTab === 'queue' && (
                            <QueueTab queueData={queueData} onPlayTrack={playTrack} />
                        )}
                        {activeTab === 'devices' && (
                            <DevicesTab
                                devices={devices}
                                activeDeviceId={playerState?.device?.id}
                                activeSonosId={activeSonos?.id}
                                onTransfer={transferPlayback}
                                onSelectSonos={selectSonosDevice}
                                onRefresh={fetchDevices}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Sub-components ---

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-sm text-slate-700 dark:text-slate-200 truncate ml-4 max-w-[70%] text-right">{value || '-'}</span>
    </div>
);

const PlayerTab: React.FC<{
    playerState: SpotifyPlayerState | null;
    currentTrack: SpotifyTrack | null;
}> = ({ playerState, currentTrack }) => (
    <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Aktuelle Wiedergabe
        </h3>
        {currentTrack ? (
            <div className="space-y-3">
                <InfoRow label="Titel" value={currentTrack.name} />
                <InfoRow label="Interpret" value={currentTrack.artists?.map(a => a.name).join(', ') ?? ''} />
                <InfoRow label="Album" value={currentTrack.album?.name ?? ''} />
            </div>
        ) : (
            <div className="text-slate-400 text-sm">Nichts wird abgespielt</div>
        )}
        {playerState?.device && (
            <>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mt-6">
                    Gerät
                </h3>
                <div className="space-y-3">
                    <InfoRow label="Name" value={playerState.device.name} />
                    <InfoRow label="Lautstärke" value={`${playerState.device.volume_percent}%`} />
                    <InfoRow label="Zufallswiedergabe" value={playerState.shuffle_state ? 'An' : 'Aus'} />
                    <InfoRow label="Wiederholen" value={
                        playerState.repeat_state === 'off' ? 'Aus' :
                        playerState.repeat_state === 'track' ? 'Titel' : 'Kontext'
                    } />
                </div>
            </>
        )}
    </div>
);

const SpotifyTrackRow: React.FC<{
    track: SpotifyTrack;
    index?: number;
    onPlay: () => void;
    onAdd?: () => void;
}> = ({ track, index, onPlay, onAdd }) => {
    const art = track.album?.images?.[0]?.url;
    return (
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
            {index !== undefined && (
                <span className="text-xs text-slate-400 w-6 text-right">{index + 1}</span>
            )}
            {art ? (
                <img src={art} alt="" className="w-10 h-10 rounded-lg object-cover flex-none" />
            ) : (
                <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-none">
                    <Music className="w-5 h-5 text-slate-400" />
                </div>
            )}
            <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-700 dark:text-slate-200 truncate">{track.name}</div>
                <div className="text-xs text-slate-400 truncate">
                    {track.artists?.map(a => a.name).join(', ')}
                    {track.album?.name ? ` - ${track.album.name}` : ''}
                </div>
            </div>
            <span className="text-xs text-slate-400 flex-none">
                {track.duration_ms ? formatMsStatic(track.duration_ms) : ''}
            </span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onAdd && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onAdd(); }}
                        className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        title="Zur Warteschlange hinzufügen"
                    >
                        <Plus className="w-4 h-4 text-slate-500" />
                    </button>
                )}
                <button
                    onClick={onPlay}
                    className="p-1.5 rounded-full bg-green-500 hover:bg-green-600 transition-colors"
                    title="Abspielen"
                >
                    <Play className="w-4 h-4 text-white" fill="white" />
                </button>
            </div>
        </div>
    );
};

// Static version of formatMs for use in sub-components
const formatMsStatic = (ms: number) => {
    if (!ms || ms < 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const SearchTab: React.FC<{
    searchTerm: string;
    setSearchTerm: (v: string) => void;
    results: SpotifyTrack[];
    onSearch: () => void;
    onPlay: (uri: string) => void;
    onAddToQueue: (uri: string) => void;
}> = ({ searchTerm, setSearchTerm, results, onSearch, onPlay, onAddToQueue }) => {
    const [showKeyboard, setShowKeyboard] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const toggleKeyboard = () => {
        setShowKeyboard(prev => {
            const next = !prev;
            if (next) {
                requestAnimationFrame(() => inputRef.current?.focus());
            }
            return next;
        });
    };

    return (
        <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                Spotify durchsuchen
            </h3>
            <div className="flex gap-2 mb-4">
                <input
                    ref={inputRef}
                    type="text"
                    inputMode={showKeyboard ? 'none' : 'text'}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && onSearch()}
                    placeholder="Suchbegriff..."
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button
                    onClick={toggleKeyboard}
                    title="Bildschirmtastatur"
                    className={`px-3 py-2 rounded-lg transition-colors text-sm border ${
                        showKeyboard
                            ? 'bg-green-500 text-white border-green-500'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                >
                    <Keyboard className="w-4 h-4" />
                </button>
                <button
                    onClick={onSearch}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm"
                >
                    <Search className="w-4 h-4" />
                </button>
            </div>
            {results.length === 0 ? (
                <div className="text-sm text-slate-400">
                    {searchTerm ? 'Keine Ergebnisse' : 'Gib einen Suchbegriff ein, um Spotify zu durchsuchen.'}
                </div>
            ) : (
                <div className={`space-y-1 ${showKeyboard ? 'pb-[35vh]' : ''}`}>
                    {results.map((track, i) => (
                        <SpotifyTrackRow
                            key={track.id || i}
                            track={track}
                            onPlay={() => onPlay(track.uri)}
                            onAdd={() => onAddToQueue(track.uri)}
                        />
                    ))}
                </div>
            )}
            {showKeyboard && <OnScreenKeyboard onClose={() => setShowKeyboard(false)} />}
        </div>
    );
};

const PlaylistsTab: React.FC<{
    playlists: SpotifyPlaylist[];
    selectedPlaylist: SpotifyPlaylist | null;
    playlistTracks: SpotifyTrack[];
    onSelectPlaylist: (p: SpotifyPlaylist) => void;
    onBack: () => void;
    onPlayPlaylist: (uri: string) => void;
    onPlayTrack: (uri: string) => void;
    onAddToQueue: (uri: string) => void;
}> = ({ playlists, selectedPlaylist, playlistTracks, onSelectPlaylist, onBack, onPlayPlaylist, onPlayTrack, onAddToQueue }) => {
    if (selectedPlaylist) {
        return (
            <div>
                <div className="flex items-center gap-3 mb-4">
                    <button
                        onClick={onBack}
                        className="text-sm text-green-500 hover:underline"
                    >
                        Zurück
                    </button>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        {selectedPlaylist.images?.[0]?.url && (
                            <img src={selectedPlaylist.images[0].url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                                {selectedPlaylist.name}
                            </div>
                            <div className="text-xs text-slate-400">{selectedPlaylist.tracks.total} Titel</div>
                        </div>
                    </div>
                    <button
                        onClick={() => onPlayPlaylist(selectedPlaylist.uri)}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm flex items-center gap-2"
                    >
                        <Play className="w-4 h-4" fill="white" />
                        Alle abspielen
                    </button>
                </div>
                <div className="space-y-1">
                    {playlistTracks.map((track, i) => (
                        <SpotifyTrackRow
                            key={track.id || i}
                            track={track}
                            index={i}
                            onPlay={() => onPlayTrack(track.uri)}
                            onAdd={() => onAddToQueue(track.uri)}
                        />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-green-500" /> Deine Playlists
            </h3>
            {playlists.length === 0 ? (
                <div className="text-sm text-slate-400">Keine Playlists gefunden</div>
            ) : (
                <div className="space-y-1">
                    {playlists.map(playlist => (
                        <button
                            key={playlist.id}
                            onClick={() => onSelectPlaylist(playlist)}
                            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                        >
                            {playlist.images?.[0]?.url ? (
                                <img src={playlist.images[0].url} alt="" className="w-12 h-12 rounded-lg object-cover flex-none" />
                            ) : (
                                <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-none">
                                    <ListMusic className="w-6 h-6 text-slate-400" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <div className="text-sm text-slate-700 dark:text-slate-200 truncate">{playlist.name}</div>
                                <div className="text-xs text-slate-400">{playlist.tracks.total} Titel</div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 flex-none" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

const QueueTab: React.FC<{
    queueData: SpotifyQueueResponse | null;
    onPlayTrack: (uri: string) => void;
}> = ({ queueData, onPlayTrack }) => {
    const queue = queueData?.queue || [];

    return (
        <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                Warteschlange ({queue.length})
            </h3>
            {queueData?.currently_playing && (
                <div className="mb-4">
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Wird gerade gespielt</div>
                    <SpotifyTrackRow
                        track={queueData.currently_playing}
                        onPlay={() => {}}
                    />
                </div>
            )}
            {queue.length === 0 ? (
                <div className="text-sm text-slate-400">Warteschlange ist leer</div>
            ) : (
                <div className="space-y-1">
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Als Nächstes</div>
                    {queue.map((track, i) => (
                        <SpotifyTrackRow
                            key={`${track.id}-${i}`}
                            track={track}
                            index={i}
                            onPlay={() => onPlayTrack(track.uri)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const DevicesTab: React.FC<{
    devices: SpotifyDevice[];
    activeDeviceId?: string;
    activeSonosId?: string;
    onTransfer: (deviceId: string) => void;
    onSelectSonos: (device: SpotifyDevice) => void;
    onRefresh: () => void;
}> = ({ devices, activeSonosId, onTransfer, onSelectSonos, onRefresh }) => {
    const spotifyDevices = devices.filter(d => d.source !== 'sonos');
    const sonosDevices = devices.filter(d => d.source === 'sonos');

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-green-500" /> Verfügbare Geräte
                </h3>
                <button onClick={onRefresh} className="text-xs text-green-500 hover:underline">Aktualisieren</button>
            </div>

            {sonosDevices.length > 0 && (
                <>
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Sonos Lautsprecher</div>
                    <div className="space-y-2 mb-4">
                        {sonosDevices.map(device => {
                            const isActive = activeSonosId === device.id;
                            return (
                                <div
                                    key={device.id}
                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                                        isActive
                                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-green-300'
                                    }`}
                                >
                                    <Speaker className={`w-5 h-5 flex-none ${isActive ? 'text-green-500' : 'text-slate-400'}`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                                            {device.name}
                                        </div>
                                        <div className="text-xs text-slate-400">
                                            {device.type} - Lautstärke: {device.volume_percent}%
                                        </div>
                                    </div>
                                    {isActive ? (
                                        <button
                                            onClick={() => onSelectSonos(device)}
                                            className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                                        >
                                            Aktiv
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => onSelectSonos(device)}
                                            className="px-3 py-1 text-xs bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                                        >
                                            Auswählen
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {spotifyDevices.length > 0 && (
                <>
                    <div className="text-xs text-slate-400 uppercase tracking-wider mb-2">Spotify Connect</div>
                    <div className="space-y-2">
                        {spotifyDevices.map(device => (
                            <div
                                key={device.id}
                                className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                                    device.is_active
                                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-green-300'
                                }`}
                            >
                                <Smartphone className={`w-5 h-5 flex-none ${device.is_active ? 'text-green-500' : 'text-slate-400'}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                                        {device.name}
                                    </div>
                                    <div className="text-xs text-slate-400">
                                        {device.type} - Lautstärke: {device.volume_percent}%
                                    </div>
                                </div>
                                {device.is_active ? (
                                    <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full">
                                        Aktiv
                                    </span>
                                ) : (
                                    <button
                                        onClick={() => onTransfer(device.id)}
                                        className="px-3 py-1 text-xs bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                                    >
                                        Hierher abspielen
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {devices.length === 0 && (
                <div className="text-sm text-slate-400">
                    Keine Geräte gefunden. Öffne Spotify auf einem Gerät oder stelle sicher, dass Sonos-Lautsprecher im Netzwerk erreichbar sind.
                </div>
            )}
        </div>
    );
};

export default SpotifyView;
