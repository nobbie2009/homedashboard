import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
    Music, Radio, ListMusic, Star, Search, RefreshCw,
    Plus, Trash2, Users, ChevronRight, Disc3, Speaker
} from 'lucide-react';
import { getApiUrl } from '../../utils/api';
import { useSecurity } from '../../contexts/SecurityContext';

interface SonosTrack {
    title: string;
    artist: string;
    album: string;
    albumArtURI: string;
    duration: number;
    position: number;
    uri: string;
}

interface SonosSpeaker {
    ip: string;
    name: string;
    model: string;
    state: string;
    volume: number;
    muted: boolean;
    currentTrack: SonosTrack | null;
}

interface FavoriteItem {
    title: string;
    uri: string;
    albumArtURI: string;
    description: string;
    metadata: string;
}

interface QueueItem {
    position: number;
    title: string;
    artist: string;
    album: string;
    albumArtURI: string;
    uri: string;
}

interface GroupInfo {
    id: string;
    name: string;
    coordinator: string;
    members: { name: string; ip: string; uuid: string }[];
}

type Tab = 'player' | 'favorites' | 'queue' | 'radio' | 'search' | 'groups';

const STATE_POLL_MS = 3000;

const SonosView: React.FC = () => {
    const { deviceId } = useSecurity();
    const [speakers, setSpeakers] = useState<SonosSpeaker[]>([]);
    const [selectedSpeaker, setSelectedSpeaker] = useState<SonosSpeaker | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('player');
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
    const [playlists, setPlaylists] = useState<FavoriteItem[]>([]);
    const [queue, setQueue] = useState<QueueItem[]>([]);
    const [groups, setGroups] = useState<GroupInfo[]>([]);
    const [radioStations, setRadioStations] = useState<FavoriteItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<FavoriteItem[]>([]);
    const [searchType, setSearchType] = useState<'tracks' | 'albums' | 'artists'>('tracks');
    const [loading, setLoading] = useState(true);
    const [discovering, setDiscovering] = useState(false);
    const volumeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

    const headers: Record<string, string> = { 'x-device-id': deviceId, 'Content-Type': 'application/json' };
    const apiUrl = getApiUrl();

    // Fetch speakers with live state from server (no discovery, just cached list + fresh state)
    const fetchSpeakers = useCallback(async () => {
        try {
            const res = await fetch(`${apiUrl}/api/sonos/speakers`, { headers });
            if (!res.ok) throw new Error();
            const data: SonosSpeaker[] = await res.json();
            setSpeakers(data);
            if (data.length > 0) {
                setSelectedSpeaker(prev => {
                    // Keep current selection if still available, else pick playing or first
                    if (prev) {
                        const updated = data.find(s => s.ip === prev.ip);
                        if (updated) return updated;
                    }
                    return data.find(s => s.state === 'playing') || data[0];
                });
            }
        } catch { /* ignore */ }
        finally {
            setLoading(false);
        }
    }, [apiUrl, deviceId]);

    // Trigger a new network discovery (admin action)
    const triggerDiscovery = useCallback(async () => {
        setDiscovering(true);
        try {
            await fetch(`${apiUrl}/api/sonos/discover`, { method: 'POST', headers });
            // After discovery, fetch fresh speaker list
            await fetchSpeakers();
        } catch { /* ignore */ }
        finally {
            setDiscovering(false);
        }
    }, [apiUrl, deviceId, fetchSpeakers]);

    // Initial load: just get cached speakers with live state
    useEffect(() => {
        fetchSpeakers();
    }, []);

    // Poll state for selected speaker + refresh all speakers periodically
    useEffect(() => {
        if (!selectedSpeaker) return;

        // Immediately fetch fresh state for selected speaker
        const pollState = async () => {
            try {
                const res = await fetch(`${apiUrl}/api/sonos/state?ip=${selectedSpeaker.ip}`, { headers });
                if (res.ok) {
                    const state = await res.json();
                    setSelectedSpeaker(prev => prev ? { ...prev, ...state } : null);
                }
            } catch { /* ignore */ }
        };

        // Run immediately, then on interval
        pollState();
        const interval = setInterval(pollState, STATE_POLL_MS);
        return () => clearInterval(interval);
    }, [selectedSpeaker?.ip]);

    // Load tab data when switching
    useEffect(() => {
        if (!selectedSpeaker) return;
        const ip = selectedSpeaker.ip;
        if (activeTab === 'favorites') {
            Promise.all([
                fetch(`${apiUrl}/api/sonos/favorites?ip=${ip}`, { headers }).then(r => r.ok ? r.json() : []),
                fetch(`${apiUrl}/api/sonos/playlists?ip=${ip}`, { headers }).then(r => r.ok ? r.json() : []),
            ]).then(([favs, pls]) => {
                setFavorites(favs);
                setPlaylists(pls);
            });
        } else if (activeTab === 'queue') {
            fetch(`${apiUrl}/api/sonos/queue?ip=${ip}`, { headers })
                .then(r => r.ok ? r.json() : [])
                .then(setQueue);
        } else if (activeTab === 'radio') {
            fetch(`${apiUrl}/api/sonos/radio?ip=${ip}`, { headers })
                .then(r => r.ok ? r.json() : [])
                .then(setRadioStations);
        } else if (activeTab === 'groups') {
            fetch(`${apiUrl}/api/sonos/groups?ip=${ip}`, { headers })
                .then(r => r.ok ? r.json() : [])
                .then(setGroups);
        }
    }, [activeTab, selectedSpeaker?.ip]);

    const sendCommand = async (action: string, body?: Record<string, unknown>) => {
        if (!selectedSpeaker) return;
        try {
            await fetch(`${apiUrl}/api/sonos/${action}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ ip: selectedSpeaker.ip, ...body }),
            });
            // Quick refresh
            const res = await fetch(`${apiUrl}/api/sonos/state?ip=${selectedSpeaker.ip}`, { headers });
            if (res.ok) {
                const state = await res.json();
                setSelectedSpeaker(prev => prev ? { ...prev, ...state } : null);
            }
        } catch { /* ignore */ }
    };

    const handleVolumeChange = (vol: number) => {
        if (!selectedSpeaker) return;
        setSelectedSpeaker(prev => prev ? { ...prev, volume: vol } : null);
        if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
        volumeTimeoutRef.current = setTimeout(() => {
            sendCommand('volume', { volume: vol });
        }, 200);
    };

    const playFavorite = async (item: FavoriteItem) => {
        if (!selectedSpeaker) return;
        await fetch(`${apiUrl}/api/sonos/play-favorite`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ip: selectedSpeaker.ip, uri: item.uri, metadata: item.metadata }),
        });
        setTimeout(() => {
            fetch(`${apiUrl}/api/sonos/state?ip=${selectedSpeaker.ip}`, { headers })
                .then(r => r.ok ? r.json() : null)
                .then(state => { if (state) setSelectedSpeaker(prev => prev ? { ...prev, ...state } : null); });
        }, 1000);
    };

    const addToQueue = async (item: FavoriteItem) => {
        if (!selectedSpeaker) return;
        await fetch(`${apiUrl}/api/sonos/queue/add`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ip: selectedSpeaker.ip, uri: item.uri, metadata: item.metadata }),
        });
    };

    const doSearch = async () => {
        if (!selectedSpeaker || !searchTerm.trim()) return;
        try {
            const res = await fetch(
                `${apiUrl}/api/sonos/search?ip=${selectedSpeaker.ip}&type=${searchType}&term=${encodeURIComponent(searchTerm)}`,
                { headers }
            );
            if (res.ok) setSearchResults(await res.json());
        } catch { /* ignore */ }
    };

    const isPlaying = selectedSpeaker?.state === 'playing';
    const track = selectedSpeaker?.currentTrack;

    const formatDuration = (seconds: number) => {
        if (!seconds) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <Disc3 className="w-12 h-12 text-blue-400 animate-spin mx-auto mb-3" />
                    <div className="text-slate-500 dark:text-slate-400">Sonos-Speaker werden gesucht...</div>
                </div>
            </div>
        );
    }

    if (speakers.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <Speaker className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                    <div className="text-lg text-slate-500 dark:text-slate-400 mb-2">Keine Sonos-Speaker gefunden</div>
                    <div className="text-sm text-slate-400 dark:text-slate-500 mb-4">
                        Stelle sicher, dass deine Sonos-Speaker eingeschaltet und im selben Netzwerk sind.
                    </div>
                    <button
                        onClick={() => triggerDiscovery()}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2 mx-auto"
                    >
                        <RefreshCw className={`w-4 h-4 ${discovering ? 'animate-spin' : ''}`} />
                        Erneut suchen
                    </button>
                </div>
            </div>
        );
    }

    const tabs: { id: Tab; icon: React.ElementType; label: string }[] = [
        { id: 'player', icon: Music, label: 'Player' },
        { id: 'favorites', icon: Star, label: 'Favoriten' },
        { id: 'queue', icon: ListMusic, label: 'Queue' },
        { id: 'radio', icon: Radio, label: 'Radio' },
        { id: 'search', icon: Search, label: 'Suche' },
        { id: 'groups', icon: Users, label: 'Gruppen' },
    ];

    return (
        <div className="h-full flex flex-col gap-4 overflow-hidden">
            {/* Speaker selector + tabs */}
            <div className="flex items-center gap-4 flex-none">
                {/* Speaker pills */}
                <div className="flex gap-2 flex-1 overflow-x-auto">
                    {speakers.map(sp => (
                        <button
                            key={sp.ip}
                            onClick={() => setSelectedSpeaker(sp)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                                selectedSpeaker?.ip === sp.ip
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-blue-300'
                            }`}
                        >
                            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                                sp.state === 'playing' ? 'bg-green-400' : 'bg-slate-400'
                            }`} />
                            {sp.name}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => triggerDiscovery()}
                    className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors flex-none"
                    title="Speaker neu suchen"
                >
                    <RefreshCw className={`w-5 h-5 text-slate-400 ${discovering ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Main content area */}
            <div className="flex-1 grid grid-cols-[1fr_2fr] gap-4 min-h-0">
                {/* Left: Now Playing + Controls */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 flex flex-col overflow-y-auto">
                    {/* Album Art */}
                    <div className="flex-none mb-4">
                        {track?.albumArtURI ? (
                            <img
                                src={track.albumArtURI}
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
                            {track?.title || 'Keine Wiedergabe'}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
                            {track?.artist || ''}
                        </div>
                        {track?.album && (
                            <div className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                                {track.album}
                            </div>
                        )}
                    </div>

                    {/* Progress bar */}
                    {track && track.duration > 0 && (
                        <div className="flex-none mb-4">
                            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                                <div
                                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                                    style={{ width: `${Math.min(100, (track.position / track.duration) * 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                                <span>{formatDuration(track.position)}</span>
                                <span>{formatDuration(track.duration)}</span>
                            </div>
                        </div>
                    )}

                    {/* Transport Controls */}
                    <div className="flex items-center justify-center gap-4 flex-none mb-4">
                        <button
                            onClick={() => sendCommand('previous')}
                            className="p-3 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <SkipBack className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                        </button>
                        <button
                            onClick={() => sendCommand(isPlaying ? 'pause' : 'play')}
                            className="p-4 rounded-full bg-blue-500 hover:bg-blue-600 transition-colors shadow-lg"
                        >
                            {isPlaying ? (
                                <Pause className="w-8 h-8 text-white" fill="white" />
                            ) : (
                                <Play className="w-8 h-8 text-white" fill="white" />
                            )}
                        </button>
                        <button
                            onClick={() => sendCommand('next')}
                            className="p-3 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <SkipForward className="w-6 h-6 text-slate-600 dark:text-slate-300" />
                        </button>
                    </div>

                    {/* Volume */}
                    <div className="flex items-center gap-3 flex-none">
                        <button
                            onClick={() => sendCommand('mute', { muted: !selectedSpeaker?.muted })}
                            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            {selectedSpeaker?.muted ? (
                                <VolumeX className="w-5 h-5 text-red-400" />
                            ) : (
                                <Volume2 className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            )}
                        </button>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={selectedSpeaker?.volume || 0}
                            onChange={e => handleVolumeChange(parseInt(e.target.value))}
                            className="flex-1 accent-blue-500 h-2"
                        />
                        <span className="text-xs text-slate-400 w-8 text-right">
                            {selectedSpeaker?.volume || 0}%
                        </span>
                    </div>
                </div>

                {/* Right: Tabbed content */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden min-h-0">
                    {/* Tab bar */}
                    <div className="flex border-b border-slate-200 dark:border-slate-800 flex-none">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${
                                    activeTab === tab.id
                                        ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                                        : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab content */}
                    <div className="flex-1 overflow-y-auto p-4">
                        {activeTab === 'player' && <PlayerTab speaker={selectedSpeaker} track={track ?? null} />}
                        {activeTab === 'favorites' && (
                            <FavoritesTab
                                favorites={favorites}
                                playlists={playlists}
                                onPlay={playFavorite}
                                onAddToQueue={addToQueue}
                            />
                        )}
                        {activeTab === 'queue' && (
                            <QueueTab
                                queue={queue}
                                onPlayItem={(pos) => {
                                    fetch(`${apiUrl}/api/sonos/queue/play`, {
                                        method: 'POST',
                                        headers,
                                        body: JSON.stringify({ ip: selectedSpeaker!.ip, position: pos }),
                                    });
                                }}
                                onClear={() => {
                                    sendCommand('queue/clear');
                                    setQueue([]);
                                }}
                            />
                        )}
                        {activeTab === 'radio' && (
                            <RadioTab stations={radioStations} onPlay={playFavorite} />
                        )}
                        {activeTab === 'search' && (
                            <SearchTab
                                searchTerm={searchTerm}
                                setSearchTerm={setSearchTerm}
                                searchType={searchType}
                                setSearchType={setSearchType}
                                results={searchResults}
                                onSearch={doSearch}
                                onPlay={playFavorite}
                                onAddToQueue={addToQueue}
                            />
                        )}
                        {activeTab === 'groups' && (
                            <GroupsTab
                                groups={groups}
                                speakers={speakers}
                                selectedIp={selectedSpeaker?.ip || ''}
                                apiUrl={apiUrl}
                                headers={headers}
                                onRefresh={() => {
                                    fetch(`${apiUrl}/api/sonos/groups?ip=${selectedSpeaker?.ip}`, { headers })
                                        .then(r => r.ok ? r.json() : [])
                                        .then(setGroups);
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Sub-components ---

const PlayerTab: React.FC<{ speaker: SonosSpeaker | null; track: SonosTrack | null }> = ({ speaker, track }) => (
    <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Aktuelle Wiedergabe
        </h3>
        {track ? (
            <div className="space-y-3">
                <InfoRow label="Titel" value={track.title} />
                <InfoRow label="Interpret" value={track.artist} />
                <InfoRow label="Album" value={track.album} />
            </div>
        ) : (
            <div className="text-slate-400 text-sm">Nichts wird abgespielt</div>
        )}
        {speaker && (
            <>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mt-6">
                    Speaker-Info
                </h3>
                <div className="space-y-3">
                    <InfoRow label="Name" value={speaker.name} />
                    <InfoRow label="Modell" value={speaker.model} />
                    <InfoRow label="IP" value={speaker.ip} />
                    <InfoRow label="Status" value={speaker.state} />
                </div>
            </>
        )}
    </div>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
    <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-sm text-slate-700 dark:text-slate-200 truncate ml-4 max-w-[70%] text-right">{value || '-'}</span>
    </div>
);

const FavoritesTab: React.FC<{
    favorites: FavoriteItem[];
    playlists: FavoriteItem[];
    onPlay: (item: FavoriteItem) => void;
    onAddToQueue: (item: FavoriteItem) => void;
}> = ({ favorites, playlists, onPlay, onAddToQueue }) => (
    <div className="space-y-6">
        <section>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-500" /> Sonos-Favoriten
            </h3>
            {favorites.length === 0 ? (
                <div className="text-sm text-slate-400">Keine Favoriten gefunden</div>
            ) : (
                <div className="space-y-1">
                    {favorites.map((item, i) => (
                        <MediaRow key={i} item={item} onPlay={() => onPlay(item)} onAdd={() => onAddToQueue(item)} />
                    ))}
                </div>
            )}
        </section>
        <section>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-blue-500" /> Sonos-Playlisten
            </h3>
            {playlists.length === 0 ? (
                <div className="text-sm text-slate-400">Keine Playlisten gefunden</div>
            ) : (
                <div className="space-y-1">
                    {playlists.map((item, i) => (
                        <MediaRow key={i} item={item} onPlay={() => onPlay(item)} onAdd={() => onAddToQueue(item)} />
                    ))}
                </div>
            )}
        </section>
    </div>
);

const QueueTab: React.FC<{
    queue: QueueItem[];
    onPlayItem: (position: number) => void;
    onClear: () => void;
}> = ({ queue, onPlayItem, onClear }) => (
    <div>
        <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Warteschlange ({queue.length})
            </h3>
            {queue.length > 0 && (
                <button
                    onClick={onClear}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                >
                    <Trash2 className="w-3 h-3" /> Leeren
                </button>
            )}
        </div>
        {queue.length === 0 ? (
            <div className="text-sm text-slate-400">Queue ist leer</div>
        ) : (
            <div className="space-y-1">
                {queue.map((item) => (
                    <button
                        key={item.position}
                        onClick={() => onPlayItem(item.position)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                        <span className="text-xs text-slate-400 w-6 text-right">{item.position + 1}</span>
                        {item.albumArtURI ? (
                            <img src={item.albumArtURI} alt="" className="w-8 h-8 rounded object-cover" />
                        ) : (
                            <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <Music className="w-4 h-4 text-slate-400" />
                            </div>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="text-sm text-slate-700 dark:text-slate-200 truncate">{item.title}</div>
                            <div className="text-xs text-slate-400 truncate">{item.artist}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 flex-none" />
                    </button>
                ))}
            </div>
        )}
    </div>
);

const RadioTab: React.FC<{
    stations: FavoriteItem[];
    onPlay: (item: FavoriteItem) => void;
}> = ({ stations, onPlay }) => (
    <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Radio className="w-4 h-4 text-orange-500" /> Radio-Sender
        </h3>
        {stations.length === 0 ? (
            <div className="text-sm text-slate-400">
                Keine Radio-Sender gefunden. Füge Sender in der Sonos-App als Favoriten hinzu.
            </div>
        ) : (
            <div className="space-y-1">
                {stations.map((item, i) => (
                    <MediaRow key={i} item={item} onPlay={() => onPlay(item)} />
                ))}
            </div>
        )}
    </div>
);

const SearchTab: React.FC<{
    searchTerm: string;
    setSearchTerm: (v: string) => void;
    searchType: 'tracks' | 'albums' | 'artists';
    setSearchType: (v: 'tracks' | 'albums' | 'artists') => void;
    results: FavoriteItem[];
    onSearch: () => void;
    onPlay: (item: FavoriteItem) => void;
    onAddToQueue: (item: FavoriteItem) => void;
}> = ({ searchTerm, setSearchTerm, searchType, setSearchType, results, onSearch, onPlay, onAddToQueue }) => (
    <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
            Musikbibliothek durchsuchen
        </h3>
        <div className="flex gap-2 mb-4">
            <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onSearch()}
                placeholder="Suchbegriff..."
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
                value={searchType}
                onChange={e => setSearchType(e.target.value as typeof searchType)}
                className="px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200"
            >
                <option value="tracks">Titel</option>
                <option value="albums">Alben</option>
                <option value="artists">Interpreten</option>
            </select>
            <button
                onClick={onSearch}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
            >
                <Search className="w-4 h-4" />
            </button>
        </div>
        {results.length === 0 ? (
            <div className="text-sm text-slate-400">
                {searchTerm ? 'Keine Ergebnisse' : 'Gib einen Suchbegriff ein, um deine Musikbibliothek zu durchsuchen.'}
            </div>
        ) : (
            <div className="space-y-1">
                {results.map((item, i) => (
                    <MediaRow key={i} item={item} onPlay={() => onPlay(item)} onAdd={() => onAddToQueue(item)} />
                ))}
            </div>
        )}
    </div>
);

const GroupsTab: React.FC<{
    groups: GroupInfo[];
    speakers: SonosSpeaker[];
    selectedIp: string;
    apiUrl: string;
    headers: Record<string, string>;
    onRefresh: () => void;
}> = ({ groups, speakers, selectedIp, apiUrl, headers, onRefresh }) => {
    const handleJoin = async (speakerIp: string, coordinatorIp: string) => {
        await fetch(`${apiUrl}/api/sonos/group/join`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ip: speakerIp, coordinatorIp }),
        });
        onRefresh();
    };

    const handleLeave = async (speakerIp: string) => {
        await fetch(`${apiUrl}/api/sonos/group/leave`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ip: speakerIp }),
        });
        onRefresh();
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-500" /> Speaker-Gruppen
                </h3>
                <button onClick={onRefresh} className="text-xs text-blue-500 hover:underline">Aktualisieren</button>
            </div>

            {groups.length === 0 ? (
                <div className="text-sm text-slate-400">Keine Gruppen gefunden</div>
            ) : (
                <div className="space-y-4">
                    {groups.map(group => (
                        <div key={group.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
                                {group.name}
                            </div>
                            <div className="space-y-1">
                                {group.members.map(member => (
                                    <div key={member.uuid} className="flex items-center justify-between py-1">
                                        <div className="flex items-center gap-2">
                                            <Speaker className="w-4 h-4 text-slate-400" />
                                            <span className="text-sm text-slate-600 dark:text-slate-300">{member.name}</span>
                                            {member.ip === group.coordinator && (
                                                <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full">
                                                    Koordinator
                                                </span>
                                            )}
                                        </div>
                                        {group.members.length > 1 && member.ip !== group.coordinator && (
                                            <button
                                                onClick={() => handleLeave(member.ip)}
                                                className="text-xs text-red-500 hover:underline"
                                            >
                                                Trennen
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Quick join controls */}
            {speakers.length > 1 && (
                <div className="mt-6">
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Speaker verbinden
                    </h4>
                    <div className="space-y-2">
                        {speakers
                            .filter(s => s.ip !== selectedIp)
                            .map(sp => (
                                <div key={sp.ip} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                                    <span className="text-sm text-slate-600 dark:text-slate-300">{sp.name}</span>
                                    <button
                                        onClick={() => handleJoin(sp.ip, selectedIp)}
                                        className="px-3 py-1 text-xs bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
                                    >
                                        Hierher gruppieren
                                    </button>
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
};

// Shared media row component
const MediaRow: React.FC<{
    item: FavoriteItem;
    onPlay: () => void;
    onAdd?: () => void;
}> = ({ item, onPlay, onAdd }) => (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group">
        {item.albumArtURI ? (
            <img src={item.albumArtURI} alt="" className="w-10 h-10 rounded-lg object-cover flex-none" />
        ) : (
            <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-none">
                <Music className="w-5 h-5 text-slate-400" />
            </div>
        )}
        <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-700 dark:text-slate-200 truncate">{item.title}</div>
            {item.description && (
                <div className="text-xs text-slate-400 truncate">{item.description}</div>
            )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onAdd && (
                <button
                    onClick={(e) => { e.stopPropagation(); onAdd(); }}
                    className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    title="Zur Queue hinzufügen"
                >
                    <Plus className="w-4 h-4 text-slate-500" />
                </button>
            )}
            <button
                onClick={onPlay}
                className="p-1.5 rounded-full bg-blue-500 hover:bg-blue-600 transition-colors"
                title="Abspielen"
            >
                <Play className="w-4 h-4 text-white" fill="white" />
            </button>
        </div>
    </div>
);

export default SonosView;
