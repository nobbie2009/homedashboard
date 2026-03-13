import { DeviceDiscovery, Sonos } from 'sonos';

// Cache for discovered speakers
let speakerCache = [];
let lastDiscovery = 0;
const DISCOVERY_TTL = 30000; // 30 seconds

// Active speaker instances keyed by IP
const speakerInstances = new Map();

function getSpeaker(ip) {
    if (!speakerInstances.has(ip)) {
        speakerInstances.set(ip, new Sonos(ip));
    }
    return speakerInstances.get(ip);
}

// Discover all Sonos speakers on the network
async function discoverSpeakers(forceRefresh = false) {
    if (!forceRefresh && speakerCache.length > 0 && Date.now() - lastDiscovery < DISCOVERY_TTL) {
        return speakerCache;
    }

    return new Promise((resolve, reject) => {
        const speakers = [];
        const timeout = setTimeout(() => {
            lastDiscovery = Date.now();
            speakerCache = speakers;
            resolve(speakers);
        }, 5000); // 5 second discovery window

        try {
            const discovery = DeviceDiscovery({ timeout: 5000 });

            discovery.on('DeviceAvailable', async (device) => {
                try {
                    const sonos = new Sonos(device.host);
                    const [desc, state, volume, muted] = await Promise.all([
                        sonos.deviceDescription(),
                        sonos.getCurrentState().catch(() => 'unknown'),
                        sonos.getVolume().catch(() => 0),
                        sonos.getMuted().catch(() => false),
                    ]);

                    let currentTrack = null;
                    try {
                        const track = await sonos.currentTrack();
                        if (track && track.title) {
                            currentTrack = {
                                title: track.title || '',
                                artist: track.artist || '',
                                album: track.album || '',
                                albumArtURI: track.albumArtURI || '',
                                duration: track.duration || 0,
                                position: track.position || 0,
                                uri: track.uri || '',
                            };
                        }
                    } catch (e) { /* no track playing */ }

                    speakers.push({
                        ip: device.host,
                        port: device.port,
                        name: desc.roomName || desc.friendlyName || device.host,
                        model: desc.modelName || '',
                        modelNumber: desc.modelNumber || '',
                        state: state,
                        volume: volume,
                        muted: muted,
                        currentTrack: currentTrack,
                    });
                } catch (err) {
                    console.error(`Failed to get info for ${device.host}:`, err.message);
                }
            });

            discovery.on('error', (err) => {
                console.error('Sonos discovery error:', err);
            });
        } catch (err) {
            clearTimeout(timeout);
            // If discovery itself fails, return cached or empty
            resolve(speakerCache.length > 0 ? speakerCache : []);
        }
    });
}

// Get detailed state for a single speaker
async function getSpeakerState(ip) {
    const sonos = getSpeaker(ip);

    const [state, volume, muted] = await Promise.all([
        sonos.getCurrentState().catch(() => 'unknown'),
        sonos.getVolume().catch(() => 0),
        sonos.getMuted().catch(() => false),
    ]);

    let currentTrack = null;
    try {
        const track = await sonos.currentTrack();
        if (track && track.title) {
            currentTrack = {
                title: track.title || '',
                artist: track.artist || '',
                album: track.album || '',
                albumArtURI: track.albumArtURI || '',
                duration: track.duration || 0,
                position: track.position || 0,
                uri: track.uri || '',
            };
        }
    } catch (e) { /* no track */ }

    return { ip, state, volume, muted, currentTrack };
}

// Transport controls
async function play(ip, uri) {
    const sonos = getSpeaker(ip);
    if (uri) {
        return sonos.play(uri);
    }
    return sonos.play();
}

async function pause(ip) {
    const sonos = getSpeaker(ip);
    return sonos.pause();
}

async function stop(ip) {
    const sonos = getSpeaker(ip);
    return sonos.stop();
}

async function next(ip) {
    const sonos = getSpeaker(ip);
    return sonos.next();
}

async function previous(ip) {
    const sonos = getSpeaker(ip);
    return sonos.previous();
}

async function setVolume(ip, volume) {
    const sonos = getSpeaker(ip);
    return sonos.setVolume(volume);
}

async function setMuted(ip, muted) {
    const sonos = getSpeaker(ip);
    return sonos.setMuted(muted);
}

async function seek(ip, seconds) {
    const sonos = getSpeaker(ip);
    return sonos.seek(seconds);
}

// Favorites & Playlists
async function getFavorites(ip) {
    const sonos = getSpeaker(ip);
    try {
        const favorites = await sonos.getFavorites();
        return (favorites.items || []).map(item => ({
            title: item.title || '',
            uri: item.uri || '',
            albumArtURI: item.albumArtURI || '',
            description: item.description || '',
            metadata: item.metadata || '',
        }));
    } catch (err) {
        console.error('Failed to get favorites:', err.message);
        return [];
    }
}

async function getPlaylists(ip) {
    const sonos = getSpeaker(ip);
    try {
        // getMusicLibrary('sonos_playlists') returns Sonos playlists
        const result = await sonos.getMusicLibrary('sonos_playlists', { start: 0, total: 100 });
        return (result.items || []).map(item => ({
            title: item.title || '',
            uri: item.uri || '',
            albumArtURI: item.albumArtURI || '',
        }));
    } catch (err) {
        console.error('Failed to get playlists:', err.message);
        return [];
    }
}

// Play a favorite by URI (with metadata for radio stations)
async function playFavorite(ip, uri, metadata) {
    const sonos = getSpeaker(ip);
    try {
        await sonos.setAVTransportURI({ uri, metadata: metadata || '' });
        await sonos.play();
        return { success: true };
    } catch (err) {
        console.error('Failed to play favorite:', err.message);
        throw err;
    }
}

// Browse TuneIn Radio
async function browseRadio(ip, category) {
    const sonos = getSpeaker(ip);
    try {
        // R:0/0 = My Radio Stations, R:0/1 = My Radio Shows
        // Default browse returns categories
        const radioId = category || 'R:0/0';
        const result = await sonos.getMusicLibrary('R:0', { start: 0, total: 100 });
        return (result.items || []).map(item => ({
            title: item.title || '',
            uri: item.uri || '',
            albumArtURI: item.albumArtURI || '',
            metadata: item.metadata || '',
        }));
    } catch (err) {
        console.error('Failed to browse radio:', err.message);
        return [];
    }
}

// Search music library (NAS / local library)
async function searchMusicLibrary(ip, searchType, term) {
    const sonos = getSpeaker(ip);
    try {
        const result = await sonos.searchMusicLibrary(searchType, term, { start: 0, total: 50 });
        return (result.items || []).map(item => ({
            title: item.title || '',
            artist: item.artist || '',
            album: item.album || '',
            uri: item.uri || '',
            albumArtURI: item.albumArtURI || '',
            metadata: item.metadata || '',
        }));
    } catch (err) {
        console.error('Failed to search music library:', err.message);
        return [];
    }
}

// Queue management
async function getQueue(ip) {
    const sonos = getSpeaker(ip);
    try {
        const queue = await sonos.getQueue();
        return (queue.items || []).map((item, index) => ({
            position: index,
            title: item.title || '',
            artist: item.artist || '',
            album: item.album || '',
            albumArtURI: item.albumArtURI || '',
            uri: item.uri || '',
            duration: item.duration || 0,
        }));
    } catch (err) {
        console.error('Failed to get queue:', err.message);
        return [];
    }
}

async function addToQueue(ip, uri, metadata) {
    const sonos = getSpeaker(ip);
    return sonos.queue({ uri, metadata: metadata || '' });
}

async function clearQueue(ip) {
    const sonos = getSpeaker(ip);
    return sonos.flush();
}

async function playFromQueue(ip, position) {
    const sonos = getSpeaker(ip);
    return sonos.selectQueue().then(() => sonos.selectTrack(position + 1));
}

// Groups
async function getGroups(ip) {
    const sonos = getSpeaker(ip);
    try {
        const groups = await sonos.getAllGroups();
        return groups.map(group => ({
            id: group.ID,
            name: group.Name,
            coordinator: group.host,
            members: group.ZoneGroupMember.map(m => ({
                name: m.ZoneName,
                ip: m.Location ? new URL(m.Location).hostname : '',
                uuid: m.UUID,
            })),
        }));
    } catch (err) {
        console.error('Failed to get groups:', err.message);
        return [];
    }
}

async function joinGroup(ip, coordinatorIp) {
    const sonos = getSpeaker(ip);
    const coordinator = getSpeaker(coordinatorIp);
    try {
        const desc = await coordinator.deviceDescription();
        await sonos.setAVTransportURI({ uri: `x-rincon:${desc.UDN?.replace('uuid:', '')}`, metadata: '' });
        return { success: true };
    } catch (err) {
        console.error('Failed to join group:', err.message);
        throw err;
    }
}

async function leaveGroup(ip) {
    const sonos = getSpeaker(ip);
    try {
        await sonos.leaveGroup();
        return { success: true };
    } catch (err) {
        console.error('Failed to leave group:', err.message);
        throw err;
    }
}

export default {
    discoverSpeakers,
    getSpeakerState,
    play,
    pause,
    stop,
    next,
    previous,
    setVolume,
    setMuted,
    seek,
    getFavorites,
    getPlaylists,
    playFavorite,
    browseRadio,
    searchMusicLibrary,
    getQueue,
    addToQueue,
    clearQueue,
    playFromQueue,
    getGroups,
    joinGroup,
    leaveGroup,
};
