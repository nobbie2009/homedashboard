/**
 * Minimaler Home-Assistant-REST-Client für die LAGE-Alarmierung.
 *
 * URL und Long-Lived-Token liegen NICHT in config.json (die bekommt jedes
 * freigegebene Gerät über GET /api/config), sondern in
 * server/data/ha_credentials.json bzw. in den Umgebungsvariablen
 * HOMEASSISTANT_URL / HOMEASSISTANT_TOKEN.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRED_PATH = path.join(__dirname, 'data', 'ha_credentials.json');

function readStored() {
    try {
        return JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
    } catch {
        return {};
    }
}

export function getCredentials() {
    const stored = readStored();
    const url = (process.env.HOMEASSISTANT_URL || stored.url || '').replace(/\/+$/, '');
    const token = process.env.HOMEASSISTANT_TOKEN || stored.token || '';
    return { url, token, fromEnv: !!process.env.HOMEASSISTANT_TOKEN };
}

export function saveCredentials({ url, token }) {
    const stored = readStored();
    const next = { ...stored };
    if (typeof url === 'string') next.url = url.trim();
    if (typeof token === 'string' && token.trim()) next.token = token.trim();
    fs.mkdirSync(path.dirname(CRED_PATH), { recursive: true });
    fs.writeFileSync(CRED_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
}

export function credentialStatus() {
    const { url, token, fromEnv } = getCredentials();
    return { url, configured: !!(url && token), fromEnv };
}

async function haFetch(method, apiPath, body, timeout = 10000) {
    const { url, token } = getCredentials();
    if (!url || !token) throw new Error('Home Assistant ist nicht eingerichtet (URL/Token fehlen)');
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(`${url}${apiPath}`, {
            method,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`HA ${res.status}: ${text.slice(0, 200)}`);
        try { return JSON.parse(text); } catch { return text; }
    } catch (e) {
        if (e.name === 'AbortError') throw new Error('Home Assistant antwortet nicht');
        throw e;
    } finally {
        clearTimeout(t);
    }
}

/** Nur lesend: prüft Verbindung und Token (GET /api/). Löst nichts aus. */
export async function checkConnection() {
    const r = await haFetch('GET', '/api/');
    return typeof r === 'object' ? r.message || 'OK' : String(r);
}

/** Nur lesend: existiert eine Entity? */
export async function getState(entityId) {
    return haFetch('GET', `/api/states/${encodeURIComponent(entityId)}`);
}

/** Dienst aufrufen, z. B. "script.fritzfonturklingwlruf" oder "notify.mobile_app_x". */
export async function callService(service, data = {}) {
    const [domain, name] = String(service || '').split('.');
    if (!domain || !name) throw new Error(`Ungültiger Dienst: ${service}`);
    return haFetch('POST', `/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(name)}`, data, 30000);
}

/**
 * Licht rot blinken lassen: abwechselnd an (rot, voll) und aus, am Ende rot an.
 * Läuft im Hintergrund; Fehler werden nur geloggt.
 */
export async function blinkLight(entityId, seconds = 30, color = [255, 0, 0]) {
    const end = Date.now() + Math.max(2, seconds) * 1000;
    let on = false;
    while (Date.now() < end) {
        on = !on;
        await callService(on ? 'light.turn_on' : 'light.turn_off',
            on ? { entity_id: entityId, rgb_color: color, brightness: 255, transition: 0 } : { entity_id: entityId, transition: 0 });
        await new Promise(r => setTimeout(r, 1000));
    }
    await callService('light.turn_on', { entity_id: entityId, rgb_color: color, brightness: 255 });
}
