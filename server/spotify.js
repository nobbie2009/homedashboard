import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TOKENS_PATH = path.join(__dirname, 'data', 'spotify-tokens.json');
const BASE_URL = 'https://api.spotify.com/v1';
const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'playlist-read-collaborative',
].join(' ');

let tokens = null;
let configRef = null;

function setConfigRef(config) {
    configRef = config;
}

function getCreds() {
    return {
        clientId: process.env.SPOTIFY_CLIENT_ID || configRef?.spotify?.clientId || '',
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET || configRef?.spotify?.clientSecret || '',
        redirectUri: process.env.SPOTIFY_REDIRECT_URI || configRef?.spotify?.redirectUri || 'http://localhost:3001/auth/spotify/callback',
    };
}

// Token Management

function loadTokens() {
    try {
        if (fs.existsSync(TOKENS_PATH)) {
            tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
            console.log('[Spotify] Tokens loaded from disk');
        }
    } catch (err) {
        console.error('[Spotify] Failed to load tokens:', err.message);
        tokens = null;
    }
    return tokens;
}

function saveTokens(newTokens) {
    tokens = newTokens;
    try {
        const dir = path.dirname(TOKENS_PATH);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
        console.log('[Spotify] Tokens saved to disk');
    } catch (err) {
        console.error('[Spotify] Failed to save tokens:', err.message);
    }
}

async function refreshAccessToken() {
    const { clientId, clientSecret } = getCreds();
    if (!clientId || !clientSecret) {
        throw new Error('Spotify Client ID und Secret müssen konfiguriert sein');
    }
    if (!tokens?.refresh_token) {
        throw new Error('No refresh token available. Please re-authorize.');
    }

    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
    });

    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        },
        body: params.toString(),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Token refresh failed (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const refreshed = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || tokens.refresh_token,
        expires_in: data.expires_in,
        expires_at: Date.now() + data.expires_in * 1000,
        token_type: data.token_type,
    };

    saveTokens(refreshed);
    return refreshed;
}

async function getValidToken() {
    if (!tokens) {
        loadTokens();
    }
    if (!tokens) {
        throw new Error('No Spotify tokens available. Please authorize first.');
    }

    // Refresh if expired or expiring within 60 seconds
    if (tokens.expires_at && Date.now() > tokens.expires_at - 60000) {
        console.log('[Spotify] Token expired or expiring soon, refreshing...');
        await refreshAccessToken();
    }

    return tokens.access_token;
}

// API Helper

async function spotifyFetch(endpoint, options = {}) {
    const accessToken = await getValidToken();
    const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

    const response = await fetch(url, {
        ...options,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    // No Content
    if (response.status === 204) {
        return null;
    }

    // Unauthorized – try refreshing token once and retry
    if (response.status === 401) {
        console.log('[Spotify] Got 401, attempting token refresh and retry...');
        await refreshAccessToken();
        const newToken = tokens.access_token;

        const retryResponse = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${newToken}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (retryResponse.status === 204) {
            return null;
        }

        if (!retryResponse.ok) {
            const errorBody = await retryResponse.text();
            throw new Error(`Spotify API error (${retryResponse.status}): ${errorBody}`);
        }

        return retryResponse.json();
    }

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Spotify API error (${response.status}): ${errorBody}`);
    }

    return response.json();
}

// OAuth

function generateAuthUrl() {
    const { clientId, redirectUri } = getCreds();
    if (!clientId || !redirectUri) {
        throw new Error('Spotify Client ID und Redirect URI müssen konfiguriert sein');
    }

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: SCOPES,
        redirect_uri: redirectUri,
    });

    return `${AUTH_URL}?${params.toString()}`;
}

async function exchangeCode(code) {
    const { clientId, clientSecret, redirectUri } = getCreds();
    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error('Spotify Client ID, Secret und Redirect URI müssen konfiguriert sein');
    }

    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
    });

    const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        },
        body: params.toString(),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Token exchange failed (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const newTokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in,
        expires_at: Date.now() + data.expires_in * 1000,
        token_type: data.token_type,
    };

    saveTokens(newTokens);
    return newTokens;
}

// API Functions

async function search(query, types = 'track', limit = 20) {
    const params = new URLSearchParams({ q: query, type: types, limit });
    return spotifyFetch(`/search?${params.toString()}`);
}

async function getPlaylists(limit = 50) {
    return spotifyFetch(`/me/playlists?limit=${limit}`);
}

async function getPlaylistTracks(playlistId) {
    return spotifyFetch(`/playlists/${playlistId}/tracks`);
}

async function getDevices() {
    return spotifyFetch('/me/player/devices');
}

async function getPlayerState() {
    return spotifyFetch('/me/player');
}

async function play(options = {}) {
    const params = options.device_id ? `?device_id=${options.device_id}` : '';
    const body = {};
    if (options.uris) body.uris = options.uris;
    if (options.context_uri) body.context_uri = options.context_uri;
    if (options.offset) body.offset = options.offset;

    return spotifyFetch(`/me/player/play${params}`, {
        method: 'PUT',
        body: JSON.stringify(body),
    });
}

async function pause(device_id) {
    const params = device_id ? `?device_id=${device_id}` : '';
    return spotifyFetch(`/me/player/pause${params}`, { method: 'PUT' });
}

async function next(device_id) {
    const params = device_id ? `?device_id=${device_id}` : '';
    return spotifyFetch(`/me/player/next${params}`, { method: 'POST' });
}

async function previous(device_id) {
    const params = device_id ? `?device_id=${device_id}` : '';
    return spotifyFetch(`/me/player/previous${params}`, { method: 'POST' });
}

async function addToQueue(uri, device_id) {
    const params = new URLSearchParams({ uri });
    if (device_id) params.set('device_id', device_id);
    return spotifyFetch(`/me/player/queue?${params.toString()}`, { method: 'POST' });
}

async function setVolume(volumePercent, device_id) {
    const params = new URLSearchParams({ volume_percent: volumePercent });
    if (device_id) params.set('device_id', device_id);
    return spotifyFetch(`/me/player/volume?${params.toString()}`, { method: 'PUT' });
}

async function transferPlayback(deviceId, playFlag = false) {
    return spotifyFetch('/me/player', {
        method: 'PUT',
        body: JSON.stringify({ device_ids: [deviceId], play: playFlag }),
    });
}

async function setShuffle(state, device_id) {
    const params = new URLSearchParams({ state });
    if (device_id) params.set('device_id', device_id);
    return spotifyFetch(`/me/player/shuffle?${params.toString()}`, { method: 'PUT' });
}

async function setRepeat(state, device_id) {
    const params = new URLSearchParams({ state });
    if (device_id) params.set('device_id', device_id);
    return spotifyFetch(`/me/player/repeat?${params.toString()}`, { method: 'PUT' });
}

async function getQueue() {
    return spotifyFetch('/me/player/queue');
}

// Load tokens on module init
loadTokens();

export default {
    setConfigRef,
    loadTokens,
    saveTokens,
    getValidToken,
    spotifyFetch,
    generateAuthUrl,
    exchangeCode,
    search,
    getPlaylists,
    getPlaylistTracks,
    getDevices,
    getPlayerState,
    play,
    pause,
    next,
    previous,
    addToQueue,
    setVolume,
    transferPlayback,
    setShuffle,
    setRepeat,
    getQueue,
};
