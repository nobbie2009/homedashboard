import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEVICES_FILE = path.join(__dirname, 'data', 'devices.json');
const BACKUP_FILE = `${DEVICES_FILE}.bak`;
const TMP_FILE = `${DEVICES_FILE}.tmp`;

// Device Status: 'pending' | 'approved' | 'rejected'

/**
 * @typedef {Object} Device
 * @property {string} id
 * @property {string} name
 * @property {string} status
 * @property {string} lastSeen
 * @property {string} ip
 * @property {string} userAgent
 */

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DEVICES_FILE))) {
    fs.mkdirSync(path.dirname(DEVICES_FILE), { recursive: true });
}

// In-memory copy of the store. The file is only ever read once at startup (or
// after a failed read) — every request used to re-parse the JSON, and a single
// unreadable read followed by a write silently wiped every registered device.
let cache = null;

// Set when neither devices.json nor the backup could be parsed. While this is
// true we refuse to persist anything, so a truncated file is never turned into
// a "valid but empty" device list that locks everybody out permanently.
let storeBroken = false;

// lastSeen is touched on every single API call. Persisting that would rewrite
// the file dozens of times per minute (and each rewrite is a chance to get
// interrupted), so we only flush it once per interval.
const LAST_SEEN_FLUSH_MS = 60 * 1000;
let lastSeenFlush = 0;

function readFileAsMap(file) {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) throw new Error('Datei ist leer');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Unerwartetes Format');
    }
    return parsed;
}

function quarantineBrokenFile() {
    try {
        if (!fs.existsSync(DEVICES_FILE)) return;
        const target = `${DEVICES_FILE}.corrupt`;
        fs.copyFileSync(DEVICES_FILE, target);
        console.error(`[Security] Defekte devices.json gesichert unter: ${target}`);
    } catch (e) {
        console.error('[Security] Konnte defekte devices.json nicht sichern:', e.message);
    }
}

function loadDevices() {
    if (cache) return cache;

    try {
        const devices = readFileAsMap(DEVICES_FILE);
        if (devices) {
            cache = devices;
            storeBroken = false;
            return cache;
        }
        // No file yet: first start, that is a legitimate empty store.
        cache = {};
        storeBroken = false;
        return cache;
    } catch (e) {
        console.error('[Security] devices.json unlesbar:', e.message);
    }

    // Primary file is damaged -> try the backup before giving up.
    try {
        const backup = readFileAsMap(BACKUP_FILE);
        if (backup) {
            quarantineBrokenFile();
            console.warn(`[Security] Geräteliste aus Backup wiederhergestellt (${Object.keys(backup).length} Gerät(e)).`);
            cache = backup;
            storeBroken = false;
            // Write the recovered list back so the next start is clean again.
            saveDevices(cache);
            return cache;
        }
    } catch (e) {
        console.error('[Security] Backup devices.json.bak unlesbar:', e.message);
    }

    // Nothing usable. Serve an empty list for this process, but never write it
    // out — the (possibly repairable) file on disk stays untouched.
    quarantineBrokenFile();
    storeBroken = true;
    cache = {};
    console.error('[Security] Geräteliste konnte nicht geladen werden. Schreibzugriff ist gesperrt,');
    console.error('[Security] damit vorhandene Freigaben nicht überschrieben werden.');
    console.error(`[Security] Datei prüfen/reparieren: ${DEVICES_FILE}`);
    return cache;
}

function saveDevices(devices) {
    cache = devices;

    if (storeBroken) {
        console.error('[Security] Speichern übersprungen: devices.json ist defekt und muss zuerst repariert werden.');
        return;
    }

    try {
        // Keep the last known good state around before touching the real file.
        if (fs.existsSync(DEVICES_FILE)) {
            try {
                fs.copyFileSync(DEVICES_FILE, BACKUP_FILE);
            } catch (e) {
                console.error('[Security] Backup konnte nicht geschrieben werden:', e.message);
            }
        }

        // Atomic write: a crash mid-write can only ever damage the tmp file.
        fs.writeFileSync(TMP_FILE, JSON.stringify(devices, null, 2));
        fs.renameSync(TMP_FILE, DEVICES_FILE);
    } catch (e) {
        console.error('Failed to save devices:', e);
    }
}

export const security = {
    /**
     * Register or update a device
     * @param {string} id - Device UUID
     * @param {string} name - Device Name (e.g. "iPad Living Room")
     * @param {string} ip - IP Address
     * @param {string} userAgent - User Agent string
     * @returns {Device} The device object
     */
    registerDevice: (id, name, ip, userAgent) => {
        const devices = loadDevices();

        if (!devices[id]) {
            // New Device
            devices[id] = {
                id,
                name: name || `Unknown Device (${id.substring(0, 6)})`,
                status: 'pending',
                firstSeen: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                ip,
                userAgent
            };
            console.log(`[Security] New Device Registered: ${id} (${ip})`);
            saveDevices(devices);
            return devices[id];
        }

        // Update existing
        devices[id].lastSeen = new Date().toISOString();
        devices[id].ip = ip;
        devices[id].userAgent = userAgent;
        if (name) devices[id].name = name;

        // Only a lastSeen/ip refresh: keep it in memory and flush occasionally.
        const now = Date.now();
        if (now - lastSeenFlush >= LAST_SEEN_FLUSH_MS) {
            lastSeenFlush = now;
            saveDevices(devices);
        }

        return devices[id];
    },

    /**
     * Check if a device is allowed
     * @param {string} id
     * @returns {boolean}
     */
    isAllowed: (id) => {
        const devices = loadDevices();
        return devices[id] && devices[id].status === 'approved';
    },

    /**
     * Get device info
     */
    getDevice: (id) => {
        const devices = loadDevices();
        return devices[id];
    },

    /**
     * Get all devices (for admin)
     */
    getAllDevices: () => {
        const devices = loadDevices();
        return Object.values(devices);
    },

    /**
     * Approve or Reject a device
     * @param {string} id
     * @param {'approved' | 'rejected' | 'pending'} status
     */
    setDeviceStatus: (id, status) => {
        const devices = loadDevices();
        if (devices[id]) {
            devices[id].status = status;
            saveDevices(devices);
            return true;
        }
        return false;
    },

    /**
     * Approve a device, creating it first if it is not registered yet.
     * Used by the admin-password unlock so a device can free itself even when
     * no approved device is left to do it from.
     * @returns {Device}
     */
    forceApprove: (id, name, ip, userAgent) => {
        const devices = loadDevices();

        if (!devices[id]) {
            devices[id] = {
                id,
                name: name || `Unknown Device (${id.substring(0, 6)})`,
                firstSeen: new Date().toISOString(),
                ip,
                userAgent
            };
        }

        devices[id].status = 'approved';
        devices[id].lastSeen = new Date().toISOString();
        if (name) devices[id].name = name;
        if (ip) devices[id].ip = ip;
        if (userAgent) devices[id].userAgent = userAgent;

        saveDevices(devices);
        console.log(`[Security] Gerät per Admin-Passwort freigeschaltet: ${devices[id].name} (${id})`);
        return devices[id];
    },

    /**
     * Delete a device
     */
    deleteDevice: (id) => {
        const devices = loadDevices();
        if (devices[id]) {
            delete devices[id];
            saveDevices(devices);
            return true;
        }
        return false;
    },

    /**
     * True when the store on disk could not be parsed. The API reports this so
     * the lock screen can say "server problem" instead of "not approved".
     */
    isStoreBroken: () => {
        loadDevices();
        return storeBroken;
    },

    /**
     * Number of approved devices. Zero means nobody can get in via the normal
     * flow — the startup check uses this to print the recovery hint.
     */
    countApproved: () => {
        const devices = loadDevices();
        return Object.values(devices).filter(d => d.status === 'approved').length;
    }
};
