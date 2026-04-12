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

/**
 * Warm up the CKJar by visiting icloud.com pages that Apple's servers
 * use to set anonymous session cookies (X-APPLE-WEBAUTH-*, WS-*, etc.).
 * These cookies travel to ckdatabasews.icloud.com via `credentials: include`
 * in the browser — we emulate that by capturing them into the jar.
 *
 * Without this step, the resolve response contains no cookies and all
 * follow-up records/query calls return 401 AUTHENTICATION_FAILED.
 */
export async function warmUpSession(jar) {
    const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
    const urls = [
        // The Photos3 bootstrap sets session cookies on the .icloud.com domain
        'https://www.icloud.com/photos/',
        // The setup/validate endpoint is called early by icloud.com and may
        // set additional auth cookies
        'https://setup.icloud.com/setup/ws/1/validate?clientBuildNumber=2610Build22&clientMasteringNumber=2610Build22'
    ];
    for (const url of urls) {
        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'User-Agent': UA,
                    'Origin': 'https://www.icloud.com',
                    'Referer': 'https://www.icloud.com/'
                },
                redirect: 'follow'
            });
            jar.ingest(res);
            // consume body to free the socket
            await res.text().catch(() => {});
        } catch (e) {
            console.log(`[icloud] session warm-up ${url}: ${e.message}`);
        }
    }
    const cookies = Array.from(jar.cookies.keys());
    console.log(`[icloud] session warm-up captured ${cookies.length} cookies: ${cookies.join(', ') || '(none)'}`);
}

function cloudKitUrl(endpoint, zone, buildInfo, { partitionBase = CK_BASE_URL, webAuthToken = null } = {}) {
    const params = new URLSearchParams({
        remapEnums: 'true',
        getCurrentSyncToken: 'true',
        clientBuildNumber: buildInfo.build,
        clientMasteringNumber: buildInfo.mastering
    });
    // CloudKit Web Services accepts the anonymous token via the
    // `ckWebAuthToken` query parameter. This is how the Photos3 web app
    // authenticates share-viewer requests without a full iCloud login.
    if (webAuthToken) params.set('ckWebAuthToken', webAuthToken);
    return `${partitionBase}/database/1/${CK_CONTAINER}/${CK_ENV}/${zone}/${endpoint}?${params}`;
}

// A tiny cookie jar so we can emulate the browser's `credentials: include`
// behaviour across multiple related CloudKit requests. Apple's web app
// *relies* on this: when you resolve a shortGUID anonymously Apple sets a
// short-lived session cookie (usually X-APPLE-WEBAUTH-*/WS-* or similar)
// that authenticates the follow-up records/query for that specific share.
// Without the cookie every follow-up query returns 401 AUTHENTICATION_FAILED.
export class CKJar {
    constructor() {
        this.cookies = new Map(); // name -> rawValue (just the `name=value` part)
        this.extraHeaders = {};   // headers captured from responses (e.g. webauth token)
    }
    ingest(res) {
        try {
            // res.headers.getSetCookie() is Node 20+; fall back to raw().
            const raw = typeof res.headers.getSetCookie === 'function'
                ? res.headers.getSetCookie()
                : (res.headers.raw?.()['set-cookie'] || []);
            for (const line of raw) {
                const first = line.split(';')[0];
                const eq = first.indexOf('=');
                if (eq <= 0) continue;
                const name = first.slice(0, eq).trim();
                this.cookies.set(name, first);
            }
        } catch {}
        // Apple sometimes hands us an X-Apple-CloudKit-WebAuthToken header we
        // need to echo back on subsequent calls.
        const tokenHeaders = [
            'x-apple-cloudkit-webauthtoken',
            'x-apple-cloudkit-request-signaturev1',
            'x-apple-cloudkit-user-record-name'
        ];
        for (const h of tokenHeaders) {
            const v = res.headers.get(h);
            if (v) this.extraHeaders[h] = v;
        }
    }
    cookieHeader() {
        if (!this.cookies.size) return undefined;
        return Array.from(this.cookies.values()).join('; ');
    }
    headers() {
        const h = { ...this.extraHeaders };
        const cookie = this.cookieHeader();
        if (cookie) h.Cookie = cookie;
        return h;
    }
}

/**
 * Normalise Apple's `anonymousPublicAccess` section into our
 * `{ partitionBase, webAuthToken }` shape. Returns null if the input is
 * missing/empty so callers can fall back to the default ckdatabasews host.
 */
export function anonymousAccessFromResolve(resolveResult) {
    const apa = resolveResult?.anonymousPublicAccess;
    if (!apa?.token) return null;
    // databasePartition is a full URL like "https://p50-ckdatabasews.icloud.com:443"
    // — strip the trailing `:443` / slash so it concatenates cleanly.
    let partitionBase = apa.databasePartition || CK_BASE_URL;
    partitionBase = partitionBase.replace(/:443$/, '').replace(/\/$/, '');
    return {
        partitionBase,
        webAuthToken: apa.token,
        partitionNumber: apa.resolvedPartitionNumber,
        ttlMs: apa.tokenTTL
    };
}

async function cloudKitPost(endpoint, body, zone = 'public', { jar = null, anonymousAccess = null } = {}) {
    const buildInfo = await fetchBuildInfo();
    const url = cloudKitUrl(endpoint, zone, buildInfo, {
        partitionBase: anonymousAccess?.partitionBase,
        webAuthToken: anonymousAccess?.webAuthToken
    });
    const res = await fetch(url, {
        method: 'POST',
        // Apple's web client sends Content-Type: text/plain even though the
        // body is JSON — sending application/json returns an error.
        headers: {
            'Content-Type': 'text/plain',
            'Accept': '*/*',
            'Origin': 'https://www.icloud.com',
            'Referer': 'https://www.icloud.com/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
            // Belt-and-braces: also send the token as a header in case some
            // Apple backends read it from there rather than the query string.
            ...(anonymousAccess?.webAuthToken ? { 'X-Apple-CloudKit-WebAuthToken': anonymousAccess.webAuthToken } : {}),
            ...(jar ? jar.headers() : {})
        },
        body: JSON.stringify(body)
    });
    if (jar) jar.ingest(res);
    return res;
}

/**
 * Resolve a short shared-album GUID into its rootRecord + asset records.
 * This is the direct equivalent of Apple's internal `resolveCMM` call.
 *
 * `shouldFetchRootRecord` is a standard CloudKit flag that asks Apple to
 * return the fully-hydrated root record instead of a minimally-resolved
 * stub. For CMM shared albums the minimally-resolved stub only carries
 * album metadata and a cover preview, so setting this is the difference
 * between a single cover image and the actual 60+ asset URLs.
 */
export async function cloudKitResolveShortGUID(shortGUID, { shouldFetchRootRecord = false, jar = null } = {}) {
    const body = {
        shortGUIDs: [{ value: shortGUID }]
    };
    if (shouldFetchRootRecord) body.shouldFetchRootRecord = true;

    // The initial resolve is always anonymous on the default ckdatabasews
    // host — this is the call that *earns* us the webAuthToken.
    const res = await cloudKitPost('records/resolve', body, 'public', { jar });
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

// Record types known or suspected to carry asset URLs in a CMM share zone.
// CPLAsset / CPLMaster are the classic iCloud Photo Library types. We also
// try the CMM-specific variants as fallback. Order matters: the first type
// that yields photos wins.
const CMM_ASSET_RECORD_TYPES = [
    'CPLAsset',
    'CPLMaster',
    'CMMAsset',
    'CMMAssetRevision',
    'CMMItem',
    'CMMMediaAsset'
];

async function runOneQuery({ zoneID, scope, recordType, zoneWide, continuationMarker, jar, anonymousAccess }) {
    const body = {
        zoneID,
        resultsLimit: 200,
        query: {
            filterBy: [],
            ...(recordType ? { recordType } : {})
        },
        ...(zoneWide ? { zoneWide: true } : {}),
        ...(continuationMarker ? { continuationMarker } : {})
    };
    const res = await cloudKitPost('records/query', body, scope, { jar, anonymousAccess });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { __raw: text.slice(0, 400) }; }
    return { res, text, data };
}

/**
 * Follow-up query that fetches the actual asset records from a shared
 * CMM album. Apple's Photos3 web app does this after resolveCMM: the
 * resolve response carries an `anonymousPublicAccess` block with a
 * short-lived web-auth token AND a specific partition host (e.g.
 * `https://p50-ckdatabasews.icloud.com:443`). All subsequent queries
 * for this share MUST be directed at that partition and MUST carry the
 * token (as `ckWebAuthToken` query parameter). Without either of those,
 * CloudKit answers 401 AUTHENTICATION_FAILED.
 */
export async function cloudKitQueryCMMAssets(resolveResult, { jar = null, anonymousAccess: anonOverride = null } = {}) {
    if (!resolveResult?.zoneID) {
        throw new Error('cloudKitQueryCMMAssets: resolveResult.zoneID missing');
    }
    const zoneID = resolveResult.zoneID;
    const anonymousAccess = anonOverride || anonymousAccessFromResolve(resolveResult);
    const primaryScope = (resolveResult.databaseScope || 'SHARED').toLowerCase();
    const scopesToTry = primaryScope === 'public'
        ? ['public', 'shared']
        : [primaryScope, 'public'];

    const attempts = [];
    const seenUrls = new Set();
    const collectedPhotos = [];

    const addPhotos = (photos, label) => {
        let added = 0;
        for (const p of photos) {
            const key = p.url.split('?')[0];
            if (seenUrls.has(key)) continue;
            seenUrls.add(key);
            collectedPhotos.push({ ...p, id: String(collectedPhotos.length), _label: label });
            added++;
        }
        return added;
    };

    // Helper: run a query and record the outcome.
    const attempt = async (label, options) => {
        try {
            const { res, data } = await runOneQuery(options);
            const photos = extractPhotosFromCloudKitResolve(data);
            const added = addPhotos(photos, label);
            attempts.push({
                strategy: label,
                status: res.status,
                ok: res.ok,
                photoCount: photos.length,
                added,
                recordCount: Array.isArray(data?.records) ? data.records.length : 0,
                continuationMarker: data?.continuationMarker || null,
                error: res.ok ? undefined : (data?.serverErrorCode || data?.reason || JSON.stringify(data).slice(0, 120))
            });
            return { res, data };
        } catch (e) {
            attempts.push({ strategy: label, error: e.message });
            return null;
        }
    };

    // Paginate one strategy across continuationMarker until CloudKit stops
    // handing them out (or we've loaded 40 pages × 200 = 8000 records).
    const paginate = async (labelBase, baseOptions) => {
        let marker;
        let page = 0;
        while (page < 40) {
            const result = await attempt(
                `${labelBase}#${page}`,
                { ...baseOptions, continuationMarker: marker }
            );
            if (!result?.res?.ok) break;
            marker = result.data?.continuationMarker;
            if (!marker) break;
            page++;
        }
    };

    // Strategy A: zoneWide query (no recordType filter). Most shares allow
    // this and it hands back every record in one go.
    for (const scope of scopesToTry) {
        await paginate(`zoneWide/${scope}`, {
            zoneID, scope, zoneWide: true, jar, anonymousAccess
        });
        if (collectedPhotos.length) {
            return { ok: true, recordType: 'zoneWide', photos: collectedPhotos, attempts };
        }
    }

    // Strategy B: typed query per record type. Fallback for shares where
    // zoneWide is rejected.
    for (const scope of scopesToTry) {
        for (const recordType of CMM_ASSET_RECORD_TYPES) {
            await paginate(`${recordType}/${scope}`, {
                zoneID, scope, recordType, jar, anonymousAccess
            });
        }
        if (collectedPhotos.length) {
            return { ok: true, recordType: 'typed-mix', photos: collectedPhotos, attempts };
        }
    }

    return { ok: false, photos: collectedPhotos, attempts };
}
