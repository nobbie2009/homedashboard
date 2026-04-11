// iCloud Shared Album proxy.
//
// Apple does not publish an official API for shared photo streams, but the
// JSON endpoints used by the iCloud web viewer are publicly reachable and
// don't require an Apple ID. This module talks to those endpoints, follows
// the partition redirect (HTTP 330), assembles the signed download URLs and
// caches the result for ~30 minutes.
//
// Notes from reverse-engineering Apple's web client:
//   • Content-Type MUST be `text/plain` even though the body is JSON. Apple's
//     own JS client does this and the server returns 4xx for application/json.
//   • The wrong-partition redirect comes back as HTTP 330 with the new host
//     in the JSON body field "X-Apple-MMe-Host" (sometimes also as a header).
//   • The signed asset URLs are valid for ~1h.

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
        // Apple's webstream API requires text/plain even though the body is
        // JSON. Sending application/json causes 4xx responses.
        headers: {
            'Content-Type': 'text/plain',
            'Accept': '*/*',
            'Origin': 'https://www.icloud.com',
            'Referer': 'https://www.icloud.com/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
        },
        body: JSON.stringify(body),
        // Status 330 isn't a standard auto-followed redirect, but be explicit.
        redirect: 'manual'
    });
}

async function readMaybeJson(res) {
    try {
        const text = await res.text();
        if (!text) return {};
        try {
            return JSON.parse(text);
        } catch {
            return { __raw: text.slice(0, 200) };
        }
    } catch {
        return {};
    }
}

async function fetchStream(token) {
    // Apple's web client always starts with p04 and follows the 330 redirect
    // to the partition that actually owns the token. Allow a couple of hops
    // in case the first redirect points at another wrong partition.
    let host = 'p04-sharedstreams.icloud.com';
    const tried = [];

    for (let attempt = 0; attempt < 4; attempt++) {
        tried.push(host);
        const res = await postJson(host, token, 'webstream', { streamCtag: null });

        if (res.status === 330) {
            const headerHost = res.headers.get('X-Apple-MMe-Host') || res.headers.get('x-apple-mme-host');
            const data = await readMaybeJson(res);
            const bodyHost = data['X-Apple-MMe-Host'] || data['x-apple-mme-host'];
            const newHost = headerHost || bodyHost;
            if (!newHost) {
                throw new Error(`webstream 330 ohne neuen Host (versucht: ${tried.join(', ')})`);
            }
            host = newHost;
            continue;
        }

        if (!res.ok) {
            const data = await readMaybeJson(res);
            const detail = data.__raw || data.error || JSON.stringify(data).slice(0, 200);
            throw new Error(`webstream HTTP ${res.status} @ ${host} – ${detail}`);
        }

        const stream = await res.json();
        return { host, stream };
    }
    throw new Error(`Zu viele Partition-Redirects (versucht: ${tried.join(', ')})`);
}

async function fetchAssetUrls(host, token, photoGuids) {
    // Apple chunks at ~25 photos per request in their own client; stay safe.
    const CHUNK = 25;
    const merged = { items: {}, locations: {} };
    for (let i = 0; i < photoGuids.length; i += CHUNK) {
        const chunk = photoGuids.slice(i, i + CHUNK);
        const res = await postJson(host, token, 'webasseturls', { photoGuids: chunk });
        if (!res.ok) {
            const data = await readMaybeJson(res);
            const detail = data.__raw || data.error || JSON.stringify(data).slice(0, 200);
            throw new Error(`webasseturls HTTP ${res.status} – ${detail}`);
        }
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

    console.log(`[icloud] fetching shared album token=${token}`);
    const { host, stream } = await fetchStream(token);
    const photoGuids = (stream.photos || []).map(p => p.photoGuid).filter(Boolean);
    console.log(`[icloud] resolved partition=${host}, photos=${photoGuids.length}`);

    if (!photoGuids.length) {
        cache.set(token, { ts: Date.now(), photos: [] });
        return { photos: [], cached: false, token };
    }

    const assets = await fetchAssetUrls(host, token, photoGuids);
    const photos = buildPhotoList(stream, assets);
    console.log(`[icloud] built ${photos.length} photo URLs`);

    cache.set(token, { ts: Date.now(), photos });
    return { photos, cached: false, token };
}

export function clearAlbumCache() {
    cache.clear();
}
