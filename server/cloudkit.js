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

async function cloudKitPost(endpoint, body, zone = 'public', jar = null) {
    const buildInfo = await fetchBuildInfo();
    const url = cloudKitUrl(endpoint, zone, buildInfo);
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

    const res = await cloudKitPost('records/resolve', body, 'public', jar);
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

async function runOneQuery({ zoneID, scope, recordType, zoneWide, continuationMarker, shortGUID, jar, extraBody }) {
    const body = {
        zoneID,
        resultsLimit: 200,
        query: {
            filterBy: [],
            ...(recordType ? { recordType } : {})
        },
        ...(shortGUID ? { shortGUID } : {}),
        ...(zoneWide ? { zoneWide: true } : {}),
        ...(continuationMarker ? { continuationMarker } : {}),
        ...extraBody
    };
    const res = await cloudKitPost('records/query', body, scope, jar);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { __raw: text.slice(0, 400) }; }
    return { res, text, data };
}

// Anonymous share acceptance. Apple's Photos3 web app does this implicitly
// via cookies: after resolveCMM the server sets a session cookie that
// authorises the viewer as an anonymous participant of the share, and
// follow-up records/query calls carry that cookie automatically (thanks to
// `credentials: "include"`).
//
// In our Node client the cookie jar handles the cookie replay. Some shares
// additionally require an explicit accept call though, which Apple's
// internal API names `records/shareAccept` or `records/accept`. We fire
// both optimistically and log the results; whichever (if any) succeeds is
// enough to authorise the subsequent query.
async function tryShareAcceptEndpoints(shortGUID, resolveResult, jar) {
    const attempts = [];
    const shareRecordName = resolveResult?.share?.recordName;
    const zoneID = resolveResult?.zoneID;
    const ownerRecordName = resolveResult?.share?.owner?.userIdentity?.userRecordName
        || resolveResult?.share?.participants?.[0]?.userIdentity?.userRecordName;

    const variants = [
        {
            endpoint: 'records/shareAccept',
            scope: 'public',
            body: { shortGUID }
        },
        {
            endpoint: 'records/share/accept',
            scope: 'public',
            body: { shortGUID }
        },
        {
            endpoint: 'records/accept',
            scope: 'public',
            body: { shortGUID, participantUserRecordName: ownerRecordName }
        },
        {
            endpoint: 'records/accept',
            scope: 'shared',
            body: { shortGUID, participantUserRecordName: ownerRecordName }
        },
        // Some Apple docs reference a `records/share/resolve` endpoint that
        // takes the share recordName and returns the asset children directly.
        {
            endpoint: 'records/share/resolve',
            scope: 'public',
            body: { shareRecordName, shortGUID, zoneID }
        }
    ];

    for (const v of variants) {
        try {
            const res = await cloudKitPost(v.endpoint, v.body, v.scope, jar);
            const text = await res.text();
            let data;
            try { data = JSON.parse(text); } catch { data = { __raw: text.slice(0, 200) }; }
            attempts.push({
                endpoint: v.endpoint,
                scope: v.scope,
                status: res.status,
                ok: res.ok,
                error: res.ok ? undefined : (data?.serverErrorCode || data?.reason || text.slice(0, 100))
            });
            if (res.ok) return { ok: true, data, attempts };
        } catch (e) {
            attempts.push({ endpoint: v.endpoint, scope: v.scope, error: e.message });
        }
    }
    return { ok: false, attempts };
}

/**
 * Follow-up query that fetches the actual asset records from a shared
 * CMM album, given the resolved root-record metadata. This is the piece
 * Apple's own Photos3 web app does after resolveCMM: query the shared
 * database scope for the child assets in the CMM zone.
 *
 * The key to making this work anonymously is authentication state. Apple's
 * server refuses the query with 401 AUTHENTICATION_FAILED unless the caller
 * is in the right session state — which means (a) carrying cookies from a
 * previous resolve call, and/or (b) having explicitly "accepted" the share
 * via records/shareAccept.
 *
 * We do both here. The caller is expected to pass the same cookie jar that
 * was used for the initial resolve call so the session is continuous.
 */
export async function cloudKitQueryCMMAssets(resolveResult, { shortGUID = null, jar = null } = {}) {
    if (!resolveResult?.zoneID) {
        throw new Error('cloudKitQueryCMMAssets: resolveResult.zoneID missing');
    }
    const zoneID = resolveResult.zoneID;
    const primaryScope = (resolveResult.databaseScope || 'SHARED').toLowerCase();
    const scopesToTry = primaryScope === 'public'
        ? ['public', 'shared']
        : [primaryScope, 'public'];

    const attempts = [];
    const seenUrls = new Set();
    const collectedPhotos = [];

    // Step 0: attempt share acceptance. This has no observable effect when
    // the resolve cookie was already enough, but unlocks the query when it
    // wasn't.
    const acceptResult = await tryShareAcceptEndpoints(shortGUID, resolveResult, jar || new CKJar());
    attempts.push({ strategy: 'shareAccept', ...acceptResult });

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
                error: res.ok ? undefined : (data?.serverErrorCode || data?.reason || JSON.stringify(data).slice(0, 120))
            });
            return { res, data };
        } catch (e) {
            attempts.push({ strategy: label, error: e.message });
            return null;
        }
    };

    // Strategy A: zoneWide query with shortGUID in the body, cookie jar.
    for (const scope of scopesToTry) {
        await attempt(`zoneWide+shortGUID/${scope}`, {
            zoneID, scope, zoneWide: true, shortGUID, jar
        });
        if (collectedPhotos.length) {
            return { ok: true, recordType: 'zoneWide', photos: collectedPhotos, attempts };
        }
    }

    // Strategy B: typed query with shortGUID in the body, cookie jar.
    for (const scope of scopesToTry) {
        for (const recordType of CMM_ASSET_RECORD_TYPES) {
            await attempt(`${recordType}/${scope}`, {
                zoneID, scope, recordType, shortGUID, jar
            });
        }
        if (collectedPhotos.length) {
            return { ok: true, recordType: 'typed-mix', photos: collectedPhotos, attempts };
        }
    }

    return { ok: false, photos: collectedPhotos, attempts };
}
