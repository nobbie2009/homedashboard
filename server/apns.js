import fs from 'fs';
import path from 'path';
import http2 from 'http2';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

// Apple Push Notification service sender (token-based / .p8 auth key).
// Fully no-op unless configured via env vars, so it never breaks the server:
//   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID (default com.familyhub.manager)
//   APNS_KEY (the .p8 contents, \n-escaped) OR APNS_KEY_PATH (path to .p8)
//   APNS_PRODUCTION=true to use the production gateway (default: sandbox)

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const TOKENS_PATH = path.join(DATA_DIR, 'apns_tokens.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const KEY_ID = process.env.APNS_KEY_ID;
const TEAM_ID = process.env.APNS_TEAM_ID;
const BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'com.familyhub.manager';
const PRODUCTION = process.env.APNS_PRODUCTION === 'true';

function loadKey() {
    if (process.env.APNS_KEY) return process.env.APNS_KEY.replace(/\\n/g, '\n');
    const p = process.env.APNS_KEY_PATH;
    if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    return null;
}
const SIGNING_KEY = loadKey();

function isConfigured() {
    return !!(KEY_ID && TEAM_ID && SIGNING_KEY);
}

let warned = false;
function warnOnce() {
    if (!warned) {
        console.log('[APNs] Not configured — iOS push disabled. Set APNS_KEY_ID, APNS_TEAM_ID and APNS_KEY/APNS_KEY_PATH.');
        warned = true;
    }
}

// APNs provider JWT is valid up to 60 min; cache and refresh well before that.
let cachedJwt = null;
let cachedAt = 0;
function authToken() {
    const now = Math.floor(Date.now() / 1000);
    if (cachedJwt && now - cachedAt < 50 * 60) return cachedJwt;
    cachedJwt = jwt.sign({ iss: TEAM_ID, iat: now }, SIGNING_KEY, {
        algorithm: 'ES256',
        header: { alg: 'ES256', kid: KEY_ID },
    });
    cachedAt = now;
    return cachedJwt;
}

function loadTokens() {
    try { return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8')); } catch { return {}; }
}
function saveTokens(t) {
    try { fs.writeFileSync(TOKENS_PATH, JSON.stringify(t, null, 2)); }
    catch (e) { console.error('[APNs] Failed to save tokens:', e.message); }
}

function sendOne(host, token, payloadStr) {
    return new Promise((resolve) => {
        const client = http2.connect(`https://${host}`);
        client.on('error', () => { resolve({ ok: false }); try { client.close(); } catch {} });
        const req = client.request({
            ':method': 'POST',
            ':path': `/3/device/${token}`,
            'authorization': `bearer ${authToken()}`,
            'apns-topic': BUNDLE_ID,
            'apns-push-type': 'alert',
        });
        let status = 0;
        req.on('response', (headers) => { status = headers[':status']; });
        req.on('data', () => {});
        req.on('end', () => { try { client.close(); } catch {} ; resolve({ ok: status === 200, status }); });
        req.on('error', () => { try { client.close(); } catch {} ; resolve({ ok: false }); });
        req.write(payloadStr);
        req.end();
    });
}

function buildPayload(payload) {
    return JSON.stringify({
        aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' },
        url: payload.url,
    });
}

export const apns = {
    isConfigured,
    saveToken: (deviceId, token) => { const t = loadTokens(); t[deviceId] = token; saveTokens(t); },
    removeToken: (deviceId) => { const t = loadTokens(); if (t[deviceId]) { delete t[deviceId]; saveTokens(t); } },
    hasToken: (deviceId) => !!loadTokens()[deviceId],

    sendToAll: async (payload, isAllowed) => {
        if (!isConfigured()) { warnOnce(); return; }
        const host = PRODUCTION ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
        const tokens = loadTokens();
        const body = buildPayload(payload);
        const stale = [];
        await Promise.all(Object.entries(tokens).map(async ([deviceId, token]) => {
            if (isAllowed && !isAllowed(deviceId)) return;
            const r = await sendOne(host, token, body);
            if (r.status === 410) stale.push(deviceId);
        }));
        if (stale.length) {
            const cur = loadTokens();
            stale.forEach(id => delete cur[id]);
            saveTokens(cur);
        }
    },

    sendToDevice: async (deviceId, payload) => {
        if (!isConfigured()) { warnOnce(); return false; }
        const host = PRODUCTION ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
        const token = loadTokens()[deviceId];
        if (!token) return false;
        const r = await sendOne(host, token, buildPayload(payload));
        if (r.status === 410) apns.removeToken(deviceId);
        return r.ok;
    },
};
