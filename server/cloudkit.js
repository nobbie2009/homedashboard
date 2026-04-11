// iCloud CloudKit Web Services client.
//
// Apple uses two entirely different backends for shared photo albums:
//
//   1. Legacy "iCloud Shared Albums" (iOS 6+, URLs like
//      https://www.icloud.com/sharedalbum/#B0xxxx) talk to
//      pXX-sharedstreams.icloud.com with the webstream / webasseturls API.
//      This is what `icloud.js` implements.
//
//   2. New "iCloud Shared Photo" links (iOS 16+, URLs like
//      https://share.icloud.com/photos/<shortGUID>) use CloudKit Web
//      Services at https://ckdatabasews.icloud.com. No partition host,
//      no redirect chain — just a single POST /records/resolve.
//
// This module handles case (2). The endpoint, container and request shape
// were extracted verbatim from Apple's own Photos3 web-app bootstrap
// (www.icloud.com/photos/ index.html, build 2610Build22 at the time of
// writing). Key excerpt:
//
//   const i = "https://ckdatabasews.icloud.com";
//   function h(t, e, o) {
//       let n = arguments.length > 3 ? arguments[3] : "private";
//       return `${e}/database/1/com.apple.photos.cloud/production/${n}/${t}
//               ?remapEnums=true&getCurrentSyncToken=true
//               &clientBuildNumber=${bn}&clientMasteringNumber=${mn}`;
//   }
//   function v(t, e, o) {  // resolveCMM
//       return _(h("records/resolve", e, o, "public"), {
//           body: JSON.stringify({shortGUIDs: [{value: t}]}),
//           headers: {"content-type": "text/plain"},
//           method: "POST",
//           credentials: "include"
//       });
//   }
//
// The response is a CloudKit Web Services envelope whose `results[].rootRecord`
// describes the shared album and whose `results[].otherRecords` carry the
// individual CPLAsset records. Each asset record has derivative fields
// (`resJPEGFullRes`, `resJPEGThumbRes`, `resOriginalRes`, ...) that carry
// signed downloadURLs directly — no follow-up lookup required.

const CK_BASE_URL = 'https://ckdatabasews.icloud.com';
const CK_CONTAINER = 'com.apple.photos.cloud';
const CK_ENV = 'production';

// Default build numbers used as a fallback when we can't extract them from
// Apple's live bootstrap HTML. These are advisory only — the resolve API
// doesn't actually validate them, but Apple may start doing so in the future.
const CK_DEFAULT_BUILD = '2610Build22';
const CK_DEFAULT_MASTERING = '2610Build22';

// In-process cache of the build numbers harvested from the Photos3 bootstrap.
let cachedBuildInfo = null; // { build, mastering, ts }
const BUILD_INFO_TTL_MS = 24 * 60 * 60 * 1000; // 24h

async function fetchBuildInfo() {
    if (cachedBuildInfo && Date.now() - cachedBuildInfo.ts < BUILD_INFO_TTL_MS) {
        return cachedBuildInfo;
    }
    // The Photos3 bootstrap embeds the current build via
    //   <html data-cw-private-build-number="2610Build22" ...>
    try {
        const res = await fetch('https://www.icloud.com/photos/', {
            method: 'GET',
            headers: {
                'Accept': 'text/html,application/xhtml+xml',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
            }
        });
        if (res.ok) {
            const html = await res.text();
            const buildMatch = html.match(/data-cw-private-build-number="([^"]+)"/);
            const masterMatch = html.match(/data-cw-private-mastering-number="([^"]+)"/);
            if (buildMatch) {
                cachedBuildInfo = {
                    build: buildMatch[1],
                    mastering: masterMatch?.[1] || buildMatch[1],
                    ts: Date.now()
                };
                return cachedBuildInfo;
            }
        }
    } catch {
        // fall through to default
    }
    cachedBuildInfo = { build: CK_DEFAULT_BUILD, mastering: CK_DEFAULT_MASTERING, ts: Date.now() };
    return cachedBuildInfo;
}

function cloudKitUrl(endpoint, zone, buildInfo) {
    const params = new URLSearchParams({
        remapEnums: 'true',
        getCurrentSyncToken: 'true',
        clientBuildNumber: buildInfo.build,
        clientMasteringNumber: buildInfo.mastering
    });
    return `${CK_BASE_URL}/database/1/${CK_CONTAINER}/${CK_ENV}/${zone}/${endpoint}?${params}`;
}

async function cloudKitPost(endpoint, body, zone = 'public') {
    const buildInfo = await fetchBuildInfo();
    const url = cloudKitUrl(endpoint, zone, buildInfo);
    return fetch(url, {
        method: 'POST',
        // Apple's web client sends Content-Type: text/plain even though the
        // body is JSON — sending application/json returns an error.
        headers: {
            'Content-Type': 'text/plain',
            'Accept': '*/*',
            'Origin': 'https://www.icloud.com',
            'Referer': 'https://www.icloud.com/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
        },
        body: JSON.stringify(body)
    });
}

/**
 * Resolve a short shared-album GUID into its rootRecord + asset records.
 * This is the direct equivalent of Apple's internal `resolveCMM` call.
 */
export async function cloudKitResolveShortGUID(shortGUID) {
    const res = await cloudKitPost('records/resolve', {
        shortGUIDs: [{ value: shortGUID }]
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { __raw: text.slice(0, 400) }; }
    if (!res.ok) {
        const err = new Error(`CloudKit resolve HTTP ${res.status}: ${text.slice(0, 200)}`);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

// Known CPLAsset derivative fields ordered from largest to smallest.
const DERIVATIVE_FIELDS = [
    'resOriginalRes',
    'resJPEGFullRes',
    'resVidFullRes',
    'resJPEGLargeRes',
    'resJPEGMedRes',
    'resJPEGThumbRes'
];

function pickDownloadUrl(fields) {
    if (!fields) return null;
    for (const key of DERIVATIVE_FIELDS) {
        const field = fields[key];
        const v = field?.value;
        if (v && typeof v === 'object' && v.downloadURL && !v.downloadURL.startsWith('data:')) {
            return {
                url: v.downloadURL,
                width: parseInt(fields.resOriginalWidth?.value ?? fields[`${key}Width`]?.value ?? 0, 10) || 0,
                height: parseInt(fields.resOriginalHeight?.value ?? fields[`${key}Height`]?.value ?? 0, 10) || 0
            };
        }
    }
    return null;
}

/**
 * Recursively walk a CloudKit response and collect every downloadURL we
 * can find. Handles both the classic iCloud Shared Album schema (CPLAsset
 * records with resJPEGFullRes / resOriginalRes derivative fields) and the
 * newer CMM (Cloud-Managed Memories) shared photo schema where the asset
 * URLs may live under previewData, assetData or arbitrary nested fields.
 *
 * We don't care about the exact field name — we just look for any nested
 * `{ downloadURL: "..." }` objects that aren't data-URIs. Width/height and
 * a "path" hint are attached best-effort.
 */
function walkDownloadUrls(node, path = '', sink = []) {
    if (node === null || node === undefined) return sink;
    if (typeof node !== 'object') return sink;

    if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
            walkDownloadUrls(node[i], `${path}[${i}]`, sink);
        }
        return sink;
    }

    // A CloudKit asset field value looks like:
    //   { fileChecksum, size, downloadURL, referenceChecksum, wrappingKey }
    if (typeof node.downloadURL === 'string' &&
        !node.downloadURL.startsWith('data:') &&
        node.downloadURL.startsWith('http')) {
        sink.push({
            url: node.downloadURL,
            size: typeof node.size === 'number' ? node.size : 0,
            path
        });
    }

    for (const [k, v] of Object.entries(node)) {
        walkDownloadUrls(v, path ? `${path}.${k}` : k, sink);
    }
    return sink;
}

/**
 * Extract photos from ANY CloudKit response (resolve, query, or lookup).
 * Works for both the legacy CPLAsset derivative-field schema and the
 * arbitrary nested-asset schema used by the new CMM shared photo streams.
 */
export function extractPhotosFromCloudKitResolve(data) {
    const found = walkDownloadUrls(data);
    // De-duplicate by URL (the same asset often appears in multiple
    // derivatives — thumb, medium, full-res — and we only want one per photo).
    const seen = new Set();
    const photos = [];
    // Sort by size descending so we pick the largest derivative first.
    found.sort((a, b) => (b.size || 0) - (a.size || 0));
    for (const item of found) {
        // Strip query string when de-duping since Apple signs every URL.
        const key = item.url.split('?')[0];
        if (seen.has(key)) continue;
        seen.add(key);
        photos.push({
            id: `${photos.length}`,
            url: item.url,
            width: 0,
            height: 0,
            caption: '',
            _path: item.path
        });
    }
    return photos;
}

/**
 * Follow-up query that fetches the actual asset records from a shared
 * CMM album, given the resolved root-record metadata. Apple's own Photos3
 * web app does this after resolveCMM: it uses the zoneID from the resolve
 * result and queries the shared database scope for the child assets.
 *
 * We don't know the exact record type up front — for legacy iCloud Shared
 * Albums it's CPLAsset, for the new CMM shares it's most likely CMMAsset /
 * CMMPhoto / CMMItem. We try a handful in sequence and return the first
 * response whose recursive walker finds at least one downloadURL.
 */
export async function cloudKitQueryCMMAssets(resolveResult) {
    if (!resolveResult?.zoneID) {
        throw new Error('cloudKitQueryCMMAssets: resolveResult.zoneID missing');
    }
    const zoneID = resolveResult.zoneID;
    // Apple reports databaseScope in uppercase (e.g. "SHARED"); the URL
    // expects it lowercase.
    const scope = (resolveResult.databaseScope || 'SHARED').toLowerCase();

    const recordTypes = [
        'CMMAsset',
        'CMMPhoto',
        'CMMItem',
        'CMMMediaAsset',
        'CMMAssetAndMaster',
        'CPLAsset',
        'CPLMaster'
    ];

    const attempts = [];

    for (const recordType of recordTypes) {
        const body = {
            zoneID,
            query: {
                recordType,
                filterBy: []
            },
            resultsLimit: 200
        };
        try {
            const res = await cloudKitPost('records/query', body, scope);
            const text = await res.text();
            let data;
            try { data = JSON.parse(text); } catch { data = { __raw: text.slice(0, 400) }; }

            const photos = extractPhotosFromCloudKitResolve(data);
            attempts.push({
                recordType,
                status: res.status,
                ok: res.ok,
                photoCount: photos.length,
                recordCount: Array.isArray(data?.records) ? data.records.length : 0,
                error: res.ok ? undefined : (data?.serverErrorCode || data?.reason || text.slice(0, 120))
            });
            if (res.ok && photos.length) {
                return { ok: true, recordType, photos, data, attempts };
            }
        } catch (e) {
            attempts.push({ recordType, error: e.message });
        }
    }

    // Last-resort: query without any recordType filter. Some CloudKit zones
    // allow a bare query that returns all records in the zone.
    try {
        const body = { zoneID, query: { filterBy: [] }, resultsLimit: 200 };
        const res = await cloudKitPost('records/query', body, scope);
        const text = await res.text();
        let data;
        try { data = JSON.parse(text); } catch { data = { __raw: text.slice(0, 400) }; }
        const photos = extractPhotosFromCloudKitResolve(data);
        attempts.push({
            recordType: '(none)',
            status: res.status,
            ok: res.ok,
            photoCount: photos.length,
            error: res.ok ? undefined : (data?.serverErrorCode || data?.reason || text.slice(0, 120))
        });
        if (res.ok && photos.length) {
            return { ok: true, recordType: '(none)', photos, data, attempts };
        }
    } catch (e) {
        attempts.push({ recordType: '(none)', error: e.message });
    }

    return { ok: false, photos: [], attempts };
}
