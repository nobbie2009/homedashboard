// iCloud Shared Album proxy.
//
// Apple does not publish an official API for shared photo streams, but the
// JSON endpoints used by the iCloud web viewer are publicly reachable and
// don't require an Apple ID. This module talks to those endpoints, follows
// the partition redirect (HTTP 330), assembles the signed download URLs and
// caches the result for ~30 minutes.

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const cache = new Map(); // token -> { ts, photos }

function extractToken(input) {
    if (!input) return null;
    const trimmed = String(input).trim();

    // share.icloud.com/photos/<token>
    let m = trimmed.match(/share\.icloud\.com\/photos\/([A-Za-z0-9]+)/);
    if (m) return m[1];

    // www.icloud.com/sharedalbum/#<token>
    m = trimmed.match(/icloud\.com\/sharedalbum\/#?([A-Za-z0-9]+)/);
    if (m) return m[1];

    // Bare token
    if (/^[A-Za-z0-9]+$/.test(trimmed)) return trimmed;

    return null;
}

async function postJson(host, token, endpoint, body) {
    const url = `https://${host}/${token}/sharedstreams/${endpoint}`;
    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Origin': 'https://www.icloud.com',
            'Referer': 'https://www.icloud.com/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
        },
        body: JSON.stringify(body)
    });
}

async function fetchStream(token) {
    let host = 'p04-sharedstreams.icloud.com';
    let res = await postJson(host, token, 'webstream', { streamCtag: null });

    // Apple uses HTTP 330 to tell us which partition actually owns this token.
    if (res.status === 330) {
        let data;
        try { data = await res.json(); } catch { data = {}; }
        const newHost = data['X-Apple-MMe-Host'] || data['x-apple-mme-host'];
        if (newHost) {
            host = newHost;
            res = await postJson(host, token, 'webstream', { streamCtag: null });
        }
    }

    if (!res.ok) {
        throw new Error(`webstream HTTP ${res.status}`);
    }
    const stream = await res.json();
    return { host, stream };
}

async function fetchAssetUrls(host, token, photoGuids) {
    // Apple chunks at ~25 photos per request in their own client; stay safe.
    const chunks = [];
    const CHUNK = 25;
    for (let i = 0; i < photoGuids.length; i += CHUNK) {
        chunks.push(photoGuids.slice(i, i + CHUNK));
    }

    const merged = { items: {}, locations: {} };
    for (const chunk of chunks) {
        const res = await postJson(host, token, 'webasseturls', { photoGuids: chunk });
        if (!res.ok) throw new Error(`webasseturls HTTP ${res.status}`);
        const data = await res.json();
        Object.assign(merged.items, data.items || {});
        Object.assign(merged.locations, data.locations || {});
    }
    return merged;
}

function buildPhotoList(stream, assets) {
    const photos = [];
    for (const photo of stream.photos || []) {
        const derivatives = photo.derivatives || {};
        // Pick the largest derivative we have a checksum for.
        const sortedKeys = Object.keys(derivatives).sort((a, b) => {
            const wa = parseInt(derivatives[a].width || '0', 10);
            const wb = parseInt(derivatives[b].width || '0', 10);
            return wb - wa;
        });

        let chosen = null;
        for (const key of sortedKeys) {
            const d = derivatives[key];
            if (d && d.checksum && assets.items[d.checksum]) {
                chosen = d;
                break;
            }
        }
        if (!chosen) continue;

        const item = assets.items[chosen.checksum];
        const location = assets.locations[item.url_location];
        if (!location || !location.hosts || !location.hosts.length) continue;

        const url = `${location.scheme || 'https'}://${location.hosts[0]}${item.url_path}`;
        photos.push({
            id: photo.photoGuid,
            url,
            width: parseInt(chosen.width || '0', 10),
            height: parseInt(chosen.height || '0', 10),
            caption: photo.caption || ''
        });
    }
    return photos;
}

export async function getSharedAlbumPhotos(rawInput) {
    const token = extractToken(rawInput);
    if (!token) {
        throw new Error('Ungültiger iCloud-Album-Link');
    }

    const cached = cache.get(token);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return { photos: cached.photos, cached: true, token };
    }

    const { host, stream } = await fetchStream(token);
    const photoGuids = (stream.photos || []).map(p => p.photoGuid).filter(Boolean);
    if (!photoGuids.length) {
        cache.set(token, { ts: Date.now(), photos: [] });
        return { photos: [], cached: false, token };
    }

    const assets = await fetchAssetUrls(host, token, photoGuids);
    const photos = buildPhotoList(stream, assets);

    cache.set(token, { ts: Date.now(), photos });
    return { photos, cached: false, token };
}

export function clearAlbumCache() {
    cache.clear();
}
