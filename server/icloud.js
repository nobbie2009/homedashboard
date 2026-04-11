// iCloud Shared Album proxy.
//
// Two completely different backends:
//
//   1. Legacy "iCloud Shared Albums" (URL: www.icloud.com/sharedalbum/#B0xxx)
//      talk to pXX-sharedstreams.icloud.com with the webstream /
//      webasseturls API. Implemented inline below with the partition /
//      HTTP-330 redirect resolver.
//
//   2. New "iCloud Shared Photo" links (URL: share.icloud.com/photos/<short>)
//      use CloudKit Web Services at ckdatabasews.icloud.com. Implemented
//      in ./cloudkit.js, called as the preferred path below.
//
// getSharedAlbumPhotos() tries CloudKit first and falls back to the
// partition API if CloudKit doesn't return a usable result, so the
// module works for both share formats.

import { cloudKitResolveShortGUID, extractPhotosFromCloudKitResolve, cloudKitQueryCMMAssets } from './cloudkit.js';

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
//
// We also try to extract a *legacy* token from the redirect Location: the
// new short share.icloud.com/photos/<short> URLs are URL shorteners that
// 30x to www.icloud.com/sharedalbum/#B0xxxx — and only the legacy B0xxx
// token is recognised by the pXX-sharedstreams.icloud.com webstream API.
async function discoverHostViaShareUrl(token, hopBudget = 5) {
    let url = `https://share.icloud.com/photos/${token}`;
    const trace = [];
    let lastRes = null;
    let lastBody = '';

    for (let hop = 0; hop < hopBudget; hop++) {
        let res;
        try {
            res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
                },
                redirect: 'manual'
            });
        } catch (e) {
            return {
                error: `share.icloud.com unreachable: ${e.message}${e.cause?.code ? ` (${e.cause.code})` : ''}`,
                trace
            };
        }

        const location = res.headers.get('location');
        trace.push({ url, status: res.status, location });
        lastRes = res;

        // Follow 30x manually so we can record the chain.
        if (res.status >= 300 && res.status < 400 && location) {
            url = new URL(location, url).toString();
            continue;
        }

        try { lastBody = await res.text(); } catch { lastBody = ''; }
        break;
    }

    // Scan the trace + body for partition hosts and legacy tokens.
    const hosts = new Set();
    const legacyTokens = new Set();
    const extras = {};

    const scan = (s) => {
        if (!s) return;
        const hostMatches = s.match(/p\d{2,3}-sharedstreams\.icloud\.com/g);
        if (hostMatches) hostMatches.forEach(m => hosts.add(m));
        // Legacy share token in URL fragments / paths, e.g. .../sharedalbum/#B0xyz...
        const tokenMatches = s.match(/sharedalbum\/?#?([A-Za-z0-9]{12,})/g);
        if (tokenMatches) {
            for (const m of tokenMatches) {
                const t = m.replace(/.*sharedalbum\/?#?/, '');
                if (t && t !== token) legacyTokens.add(t);
            }
        }
    };

    // Look for additional indicators that might give us a clue about how
    // Apple really wants us to fetch this album in the new format.
    const scanExtras = (s) => {
        if (!s) return;
        // <meta http-equiv="refresh" content="0; url=...">
        const metaRefresh = s.match(/http-equiv=["']refresh["'][^>]*url=([^"'>\s]+)/i);
        if (metaRefresh) extras.metaRefresh = metaRefresh[1];

        // window.location = "..." or window.location.href = "..."
        const jsRedirect = s.match(/window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/);
        if (jsRedirect) extras.jsRedirect = jsRedirect[1];

        // Embedded JSON config blobs commonly used by Apple's web apps
        const bootArgs = s.match(/(?:bootArgs|__INITIAL_STATE__|window\.SCNF)\s*=\s*({[\s\S]{0,500})/);
        if (bootArgs) extras.bootArgs = bootArgs[1].slice(0, 300);

        // Any *.icloud.com URL that is not the share host itself
        const icloudUrls = s.match(/https:\/\/[a-z0-9.-]+\.icloud\.com[^"'\s<>]*/gi);
        if (icloudUrls) {
            const filtered = [...new Set(icloudUrls)]
                .filter(u => !u.includes('share.icloud.com'))
                .slice(0, 6);
            if (filtered.length) extras.icloudUrls = filtered;
        }
    };

    for (const t of trace) {
        scan(t.location);
    }
    if (lastRes) {
        scan(lastRes.headers.get('x-apple-mme-host'));
    }
    scan(lastBody);
    scanExtras(lastBody);

    // Log the full body to docker logs (capped) for offline diagnosis.
    console.log(`[icloud] discovery body (${lastBody.length}b, status=${lastRes?.status}):\n${lastBody.slice(0, 4000)}`);
    if (Object.keys(extras).length) {
        console.log(`[icloud] discovery extras:`, JSON.stringify(extras));
    }

    return {
        hosts: Array.from(hosts),
        legacyTokens: Array.from(legacyTokens),
        extras,
        status: lastRes?.status ?? 0,
        trace,
        bodyPreview: lastBody.slice(0, 400)
    };
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

    // 1) Probe share.icloud.com — may yield a partition host AND/OR a legacy
    //    B0xxx token that the partition API actually understands.
    const discovery = await discoverHostViaShareUrl(token);
    const discoveredHosts = discovery.hosts || [];
    const legacyTokens = discovery.legacyTokens || [];
    const extras = discovery.extras || {};

    if (discovery.error) {
        console.log(`[icloud] share.icloud.com discovery failed: ${discovery.error}`);
    } else {
        console.log(`[icloud] share.icloud.com discovery: status=${discovery.status} hosts=[${discoveredHosts.join(',')}] legacyTokens=[${legacyTokens.join(',')}]`);
    }

    // 2) If discovery handed us a legacy token, switch to it for the API
    //    calls below — the original short token isn't accepted by webstream.
    const tokensToTry = [];
    for (const t of legacyTokens) tokensToTry.push(t);
    tokensToTry.push(token); // fall back to the original

    for (const activeToken of tokensToTry) {
        const candidates = [];
        const seen = new Set();
        for (const h of [...discoveredHosts, ...candidateHosts(activeToken)]) {
            if (!seen.has(h)) { seen.add(h); candidates.push(h); }
        }

        for (const host of candidates) {
            const result = await tryHost(host, activeToken, 4);
            if (result.ok) {
                return { host: result.host, token: activeToken, stream: result.stream };
            }
            failures.push(`${activeToken === token ? '' : `[${activeToken}] `}${host}: HTTP ${result.status} (${result.error})`);
            if (result.status === 401 || result.status === 403) break;
        }
    }

    // Build a rich error string that includes the most useful piece of
    // diagnostics from discovery — depending on what Apple sent back, this
    // will be the meta refresh URL, a JS redirect target, an iCloud URL list,
    // or as a last resort the first 200 chars of the HTML body.
    const hint = [];
    if (discovery.error) {
        hint.push(`error=${discovery.error}`);
    } else {
        hint.push(`status=${discovery.status}`);
        if (discoveredHosts.length) hint.push(`hosts=[${discoveredHosts.join(',')}]`);
        if (legacyTokens.length) hint.push(`legacy=[${legacyTokens.join(',')}]`);
        if (extras.metaRefresh) hint.push(`metaRefresh=${extras.metaRefresh}`);
        if (extras.jsRedirect) hint.push(`jsRedirect=${extras.jsRedirect}`);
        if (extras.icloudUrls?.length) hint.push(`icloudUrls=[${extras.icloudUrls.join(',')}]`);
        if (extras.bootArgs) hint.push(`bootArgs=${extras.bootArgs.slice(0, 80)}…`);
        if (!discoveredHosts.length && !legacyTokens.length && !Object.keys(extras).length) {
            hint.push(`bodyPreview=${(discovery.bodyPreview || '').slice(0, 200).replace(/\s+/g, ' ')}`);
        }
    }
    throw new Error(
        `Kein Partition-Server akzeptierte das Token. Discovery: ${hint.join(', ')}. ` +
        `Versucht: ${failures.slice(0, 6).join('; ')}`
    );
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

    // Strategy 1: CloudKit Web Services — this is what the new
    // share.icloud.com/photos/<short> links actually use. For new-style
    // tokens this succeeds directly; for old B0xxx tokens it will error
    // out with 400/404 and we fall through to the legacy partition API.
    try {
        const resolveData = await cloudKitResolveShortGUID(token);
        const resolveSize = JSON.stringify(resolveData).length;

        // First try to pull photos straight out of the resolve response —
        // Apple sometimes includes a previewData asset on the CMMRoot record
        // that already has a downloadURL we can use.
        let photos = extractPhotosFromCloudKitResolve(resolveData);
        console.log(`[icloud] CloudKit resolve (${resolveSize}b): ${photos.length} photos from resolve response`);

        // The resolve response is usually "minimally resolved" and only
        // contains the CMMRoot record (album metadata). The individual
        // asset records have to be fetched via records/query in the
        // shared zone that the resolve result points to.
        if (photos.length === 0 && resolveData?.results?.[0]?.zoneID) {
            console.log(`[icloud] CloudKit resolve is minimally resolved, running follow-up records/query…`);
            const queryResult = await cloudKitQueryCMMAssets(resolveData.results[0]);
            console.log(`[icloud] CloudKit query attempts: ${JSON.stringify(queryResult.attempts)}`);
            if (queryResult.ok && queryResult.photos.length) {
                photos = queryResult.photos;
                console.log(`[icloud] CloudKit query succeeded: recordType=${queryResult.recordType}, photos=${photos.length}`);
            } else {
                console.log(`[icloud] CloudKit query exhausted all recordTypes, 0 photos`);
                // Log the raw resolve body so we can iterate on the parser
                // in a follow-up PR if needed.
                console.log(`[icloud] CloudKit resolve raw (first 4000b):\n${JSON.stringify(resolveData).slice(0, 4000)}`);
            }
        }

        if (photos.length) {
            cache.set(token, { ts: Date.now(), photos });
            return { photos, cached: false, token, source: 'cloudkit' };
        }

        console.log(`[icloud] CloudKit resolve+query returned 0 photos, falling through to legacy partition API`);
    } catch (e) {
        console.log(`[icloud] CloudKit resolve failed: ${e.message}`);
    }

    // Strategy 2: legacy pXX-sharedstreams.icloud.com partition API for
    // old B0xxx tokens (www.icloud.com/sharedalbum/#B0xxx format).
    // fetchStream may translate the input token to a legacy B0xxx token
    // (resolved via the share.icloud.com URL shortener). The asset URLs have
    // to be fetched against that same legacy token, not the original.
    const { host, token: activeToken, stream } = await fetchStream(token);
    const photoGuids = (stream.photos || []).map(p => p.photoGuid).filter(Boolean);
    console.log(`[icloud] resolved partition=${host}, activeToken=${activeToken}, photos=${photoGuids.length}`);

    if (!photoGuids.length) {
        cache.set(token, { ts: Date.now(), photos: [] });
        return { photos: [], cached: false, token };
    }

    const assets = await fetchAssetUrls(host, activeToken, photoGuids);
    const photos = buildPhotoList(stream, assets);
    console.log(`[icloud] built ${photos.length} photo URLs`);

    cache.set(token, { ts: Date.now(), photos });
    return { photos, cached: false, token, source: 'legacy' };
}

// Debug helper used by GET /api/icloud/debug — returns everything we know
// about the album: share.icloud.com HTML discovery, the raw CloudKit
// resolve response, and the follow-up records/query attempts. Paste the
// JSON into a bug report so we can iterate on the parser offline.
export async function debugSharedAlbum(rawInput) {
    const token = extractToken(rawInput);
    if (!token) return { error: 'Ungültiger iCloud-Album-Link' };

    const discovery = await discoverHostViaShareUrl(token);

    let cloudkit;
    try {
        const data = await cloudKitResolveShortGUID(token);
        const resolvePhotos = extractPhotosFromCloudKitResolve(data);

        let queryResult = null;
        if (resolvePhotos.length === 0 && data?.results?.[0]?.zoneID) {
            try {
                queryResult = await cloudKitQueryCMMAssets(data.results[0]);
            } catch (e) {
                queryResult = { ok: false, error: e.message };
            }
        }

        cloudkit = {
            ok: true,
            rawSize: JSON.stringify(data).length,
            topLevelKeys: Object.keys(data || {}),
            resultCount: data?.results?.length ?? 0,
            firstResultKeys: Object.keys(data?.results?.[0] || {}),
            rootRecordType: data?.results?.[0]?.rootRecord?.recordType,
            rootRecordFieldKeys: Object.keys(data?.results?.[0]?.rootRecord?.fields || {}),
            zoneID: data?.results?.[0]?.zoneID,
            databaseScope: data?.results?.[0]?.databaseScope,
            photosFromResolve: resolvePhotos,
            queryAttempts: queryResult?.attempts,
            queryOk: queryResult?.ok,
            queryRecordType: queryResult?.recordType,
            photosFromQuery: queryResult?.photos,
            preview: JSON.stringify(data).slice(0, 8000)
        };
    } catch (e) {
        cloudkit = { ok: false, error: e.message, status: e.status, data: e.data };
    }

    return { token, discovery, cloudkit };
}

export function clearAlbumCache() {
    cache.clear();
}
