import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEVICES_FILE = path.join(__dirname, 'data', 'devices.json');

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

function loadDevices() {
    if (!fs.existsSync(DEVICES_FILE)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
    } catch (e) {
        console.error("Failed to load devices:", e);
        return {};
    }
}

function saveDevices(devices) {
    try {
        fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
    } catch (e) {
        console.error("Failed to save devices:", e);
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
        } else {
            // Update existing
            devices[id].lastSeen = new Date().toISOString();
            devices[id].ip = ip;
            devices[id].userAgent = userAgent;
            if (name) devices[id].name = name;
        }

        saveDevices(devices);
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
    }
};
