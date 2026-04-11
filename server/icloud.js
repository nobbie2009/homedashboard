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
//   • If we POST to a partition that doesn't know the token at all (e.g.
//     newer share.icloud.com tokens against legacy p04), Apple returns plain
//     HTTP 404 instead of a redirect. We therefore have to derive the right
//     starting partition from the token's first character.
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

// Two base62 mappings are in use across known iCloud client implementations.
// We try both and follow 330 redirects from there.
const BASE62_LETTERS_FIRST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const BASE62_DIGITS_FIRST = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function partitionHost(n) {
    return `p${String(n).padStart(2, '0')}-sharedstreams.icloud.com`;
}

function candidateHosts(token) {
    const seen = new Set();
    const hosts = [];
    const push = (h) => {
        if (h && !seen.has(h)) { seen.add(h); hosts.push(h); }
    };

    const first = token.charAt(0);
    const i1 = BASE62_LETTERS_FIRST.indexOf(first);
    const i2 = BASE62_DIGITS_FIRST.indexOf(first);
    if (i1 >= 0) push(partitionHost(i1));
    if (i2 >= 0) push(partitionHost(i2));

    // Legacy default used by older clients — known to resolve at DNS level.
    push('p04-sharedstreams.icloud.com');

    // Sequential probe through low-numbered partitions; these are the
    // partitions Apple has historically used and are very likely to have
    // valid DNS records, so we won't waste time on NXDOMAIN.
    for (let n = 1; n <= 30; n++) push(partitionHost(n));

    // A few higher numbers we've seen in the wild.
    [42, 50, 60, 100, 123, 147, 195].forEach(n => push(partitionHost(n)));

    return hosts;
}

// Apple's share.icloud.com page sometimes responds with a redirect or with
// HTML containing a `pXX-sharedstreams.icloud.com` reference. We probe the
// share URL once at the very start so we can jump straight to the right
// partition without doing dozens of POST attempts.
async function discoverHostViaShareUrl(token) {
    const url = `https://share.icloud.com/photos/${token}`;
    let res;
    try {
        res = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
            },
            redirect: 'manual'
        });
    } catch (e) {
        return { error: `share.icloud.com unreachable: ${e.message}${e.cause?.code ? ` (${e.cause.code})` : ''}` };
    }

    const found = new Set();
    const collect = (s) => {
        if (!s) return;
        const matches = s.match(/p\d{2,3}-sharedstreams\.icloud\.com/g);
        if (matches) matches.forEach(m => found.add(m));
    };

    collect(res.headers.get('location'));
    collect(res.headers.get('x-apple-mme-host'));

    try {
        const text = await res.text();
        collect(text);
    } catch { /* ignore */ }

    return { hosts: Array.from(found), status: res.status };
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

async function tryHost(host, token, hopBudget) {
    let current = host;
    const hops = [];
    for (let i = 0; i < hopBudget; i++) {
        hops.push(current);
        let res;
        try {
            res = await postJson(current, token, 'webstream', { streamCtag: null });
        } catch (e) {
            // Network-level failure (DNS, TCP, TLS, timeout). Surface the
            // underlying cause code so the operator can tell DNS misses
            // (ENOTFOUND) apart from real reachability problems.
            const code = e.cause?.code || e.code || 'fetch';
            return { ok: false, status: 0, host: current, hops, error: `${code}: ${e.message}` };
        }

        if (res.status === 330) {
            const headerHost = res.headers.get('X-Apple-MMe-Host') || res.headers.get('x-apple-mme-host');
            const data = await readMaybeJson(res);
            const bodyHost = data['X-Apple-MMe-Host'] || data['x-apple-mme-host'];
            const newHost = headerHost || bodyHost;
            if (!newHost) {
                return { ok: false, status: 330, host: current, hops, error: '330 ohne Host' };
            }
            current = newHost;
            continue;
        }

        if (res.ok) {
            const stream = await res.json();
            return { ok: true, host: current, hops, stream };
        }

        const data = await readMaybeJson(res);
        const detail = data.__raw || data.error || JSON.stringify(data).slice(0, 120);
        return { ok: false, status: res.status, host: current, hops, error: detail };
    }
    return { ok: false, status: 0, host: current, hops, error: 'zu viele Hops' };
}

async function fetchStream(token) {
    const failures = [];

    // 1) Try to discover the host directly from share.icloud.com first.
    const discovery = await discoverHostViaShareUrl(token);
    const discovered = discovery.hosts || [];
    if (discovered.length) {
        console.log(`[icloud] share.icloud.com discovery → ${discovered.join(', ')}`);
    } else if (discovery.error) {
        console.log(`[icloud] share.icloud.com discovery failed: ${discovery.error}`);
    } else {
        console.log(`[icloud] share.icloud.com discovery: HTTP ${discovery.status}, no host hint`);
    }

    // 2) Build the candidate ordering: discovered first, then derived ones.
    const candidates = [];
    const seen = new Set();
    for (const h of [...discovered, ...candidateHosts(token)]) {
        if (!seen.has(h)) { seen.add(h); candidates.push(h); }
    }

    for (const host of candidates) {
        const result = await tryHost(host, token, 4);
        if (result.ok) {
            return { host: result.host, stream: result.stream };
        }
        failures.push(`${host}: HTTP ${result.status} (${result.error})`);
        // 401/403 means the token is valid but unauthorized — no point trying
        // further partitions, the album is gone or private.
        if (result.status === 401 || result.status === 403) break;
    }

    throw new Error(`Kein Partition-Server akzeptierte das Token. Versucht: ${failures.slice(0, 5).join('; ')}`);
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
