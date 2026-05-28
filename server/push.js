import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import webpush from 'web-push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const VAPID_PATH = path.join(DATA_DIR, 'vapid.json');
const SUBS_PATH = path.join(DATA_DIR, 'push_subscriptions.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// VAPID keys are generated once and persisted so existing subscriptions stay valid.
function loadVapid() {
    if (fs.existsSync(VAPID_PATH)) {
        try {
            return JSON.parse(fs.readFileSync(VAPID_PATH, 'utf8'));
        } catch (e) {
            console.error('[Push] Failed to read VAPID keys, regenerating:', e.message);
        }
    }
    const keys = webpush.generateVAPIDKeys();
    try {
        fs.writeFileSync(VAPID_PATH, JSON.stringify(keys, null, 2));
        console.log('[Push] Generated new VAPID keys');
    } catch (e) {
        console.error('[Push] Failed to persist VAPID keys:', e.message);
    }
    return keys;
}

const vapid = loadVapid();
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:familyhub@localhost';
webpush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey);

// subscriptions: { [deviceId]: PushSubscription }
function loadSubs() {
    if (!fs.existsSync(SUBS_PATH)) return {};
    try {
        return JSON.parse(fs.readFileSync(SUBS_PATH, 'utf8'));
    } catch {
        return {};
    }
}

function saveSubs(subs) {
    try {
        fs.writeFileSync(SUBS_PATH, JSON.stringify(subs, null, 2));
    } catch (e) {
        console.error('[Push] Failed to save subscriptions:', e.message);
    }
}

function isGone(err) {
    return err && (err.statusCode === 404 || err.statusCode === 410);
}

export const push = {
    getPublicKey: () => vapid.publicKey,

    saveSubscription: (deviceId, subscription) => {
        const subs = loadSubs();
        subs[deviceId] = subscription;
        saveSubs(subs);
    },

    removeSubscription: (deviceId) => {
        const subs = loadSubs();
        if (subs[deviceId]) {
            delete subs[deviceId];
            saveSubs(subs);
        }
    },

    hasSubscription: (deviceId) => !!loadSubs()[deviceId],

    /**
     * Send a notification to every subscribed device.
     * @param {{title:string, body?:string, tag?:string, url?:string}} payload
     * @param {(deviceId:string)=>boolean} [isAllowed] only notify still-approved devices
     */
    sendToAll: async (payload, isAllowed) => {
        const subs = loadSubs();
        const data = JSON.stringify(payload);
        const stale = [];
        await Promise.all(
            Object.entries(subs).map(async ([deviceId, sub]) => {
                if (isAllowed && !isAllowed(deviceId)) return;
                try {
                    await webpush.sendNotification(sub, data);
                } catch (err) {
                    if (isGone(err)) stale.push(deviceId);
                    else console.warn('[Push] send failed for', deviceId, err.statusCode || err.message);
                }
            })
        );
        if (stale.length) {
            const current = loadSubs();
            stale.forEach(id => delete current[id]);
            saveSubs(current);
        }
    },

    sendToDevice: async (deviceId, payload) => {
        const sub = loadSubs()[deviceId];
        if (!sub) return false;
        try {
            await webpush.sendNotification(sub, JSON.stringify(payload));
            return true;
        } catch (err) {
            if (isGone(err)) push.removeSubscription(deviceId);
            else console.warn('[Push] test send failed:', err.statusCode || err.message);
            return false;
        }
    },
};
