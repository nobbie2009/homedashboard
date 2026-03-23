import { DeviceDiscovery, Sonos } from 'sonos';

// Persistent speaker list (IPs + names discovered)
let knownSpeakers = []; // { ip, port, name, model, modelNumber }
let discoveryRunning = false;

// Active speaker instances keyed by IP
const speakerInstances = new Map();

function getSpeaker(ip) {
    if (!speakerInstances.has(ip)) {
        speakerInstances.set(ip, new Sonos(ip));
    }
    return speakerInstances.get(ip);
}

// Run discovery: finds speakers on the network and stores them persistently
// This should be called at server boot and can be re-triggered from admin
async function runDiscovery() {
    if (discoveryRunning) {
        console.log('Sonos discovery already running, skipping...');
        return knownSpeakers;
    }
    discoveryRunning = true;
    console.log('Starting Sonos speaker discovery...');

    return new Promise((resolve) => {
        const foundIps = new Set();
        const devicePromises = [];

        const finish = () => {
            // Wait for all device info to be fetched before resolving
            Promise.allSettled(devicePromises).then(() => {
                discoveryRunning = false;
                console.log(`Sonos discovery complete: ${knownSpeakers.length} speaker(s) found`);
                resolve(knownSpeakers);
            });
        };

        const timeout = setTimeout(finish, 8000); // 8 second discovery window

        try {
            const discovery = DeviceDiscovery({ timeout: 8000 });

            discovery.on('DeviceAvailable', (device) => {
                if (foundIps.has(device.host)) return; // skip duplicates
                foundIps.add(device.host);

                const promise = (async () => {
                    try {
                        const sonos = getSpeaker(device.host);
                        const desc = await sonos.deviceDescription();

                        const speakerInfo = {
                            ip: device.host,
                            port: device.port,
                            name: desc.roomName || desc.friendlyName || device.host,
                            model: desc.modelName || '',
                            modelNumber: desc.modelNumber || '',
                        };

                        // Update or add to known speakers
                        const existingIdx = knownSpeakers.findIndex(s => s.ip === device.host);
                        if (existingIdx >= 0) {
                            knownSpeakers[existingIdx] = speakerInfo;
                        } else {
                            knownSpeakers.push(speakerInfo);
                        }
                    } catch (err) {
                        console.error(`Failed to get info for ${device.host}:`, err.message);
                    }
                })();

                devicePromises.push(promise);
            });

            discovery.on('error', (err) => {
                console.error('Sonos discovery error:', err);
            });
        } catch (err) {
            clearTimeout(timeout);
            discoveryRunning = false;
            resolve(knownSpeakers);
        }
    });
}

// Get speakers list with live state (uses cached speaker list, fetches fresh state)
async function getSpeakersWithState() {
    if (knownSpeakers.length === 0) {
        // No speakers discovered yet, try once
        await runDiscovery();
    }

    // Fetch live state for all known speakers in parallel
    const results = await Promise.allSettled(
        knownSpeakers.map(async (speaker) => {
            try {
                const state = await getSpeakerState(speaker.ip);
                return { ...speaker, ...state };
            } catch {
                return { ...speaker, state: 'unreachable', volume: 0, muted: false, currentTrack: null };
            }
        })
    );

    return results
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value);
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

// Check if a URI is a container type (playlist, album) that needs queue-based playback
function isContainerUri(uri) {
    return uri.startsWith('x-rincon-cpcontainer:') ||
           uri.startsWith('x-rincon-playlist:') ||
           uri.startsWith('S:') ||
           uri.startsWith('SQ:') ||
           uri.startsWith('A:');
}

// Play a favorite via queue-based approach (for containers: playlists, albums, etc.)
async function playViaQueue(sonos, uri, metadata) {
    await sonos.flush();
    await sonos.queue({ uri, metadata: metadata || '' });
    await sonos.selectQueue();
    // selectQueue -> setAVTransportURI already triggers play(), no extra play() needed
}

// Play a favorite by URI – handles both single items/streams and containers (playlists, albums)
async function playFavorite(ip, uri, metadata) {
    const sonos = getSpeaker(ip);
    console.log(`[Sonos] playFavorite: uri=${uri}, hasMetadata=${!!metadata}, isContainer=${isContainerUri(uri)}`);

    if (isContainerUri(uri)) {
        // Container URIs (playlists, albums) must be queued – SetAVTransportURI won't work
        try {
            await playViaQueue(sonos, uri, metadata);
            return { success: true };
        } catch (err) {
            console.error(`[Sonos] Queue-based playback failed for container URI: ${err.message}`);
            throw err;
        }
    }

    // Non-container: try SetAVTransportURI first (streams, single tracks)
    // Note: setAVTransportURI already calls play() internally
    try {
        await sonos.setAVTransportURI({ uri, metadata: metadata || '', onlySetUri: true });
        await sonos.play();
        return { success: true };
    } catch (err) {
        console.log(`[Sonos] setAVTransportURI failed, trying queue-based fallback: ${err.message}`);
        // Fallback: try queue-based approach for URIs not detected as container
        try {
            await playViaQueue(sonos, uri, metadata);
            return { success: true };
        } catch (err2) {
            console.error(`[Sonos] Both playback methods failed. URI: ${uri}, Error: ${err2.message}`);
            throw err2;
        }
    }
}

// Browse TuneIn Radio
async function browseRadio(ip, category) {
    const sonos = getSpeaker(ip);
    try {
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
    runDiscovery,
    getSpeakersWithState,
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
