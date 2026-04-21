import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execFile, exec } from 'child_process';
import { Client } from '@notionhq/client';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { security } from './security.js';
import sonos from './sonos.js';
import { getSharedAlbumPhotos, clearAlbumCache, debugSharedAlbum } from './icloud.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const PORT = 3001;

// --- Security Middleware ---
app.use((req, res, next) => {
    // 1. Allow Auth Endpoints
    if (req.path.startsWith('/api/auth')) {
        return next();
    }

    // 2. Allow OAuth Callbacks (Google)
    if (req.path.startsWith('/auth/')) {
        return next();
    }

    // 3. Check Device ID
    // Support both Header (for API fetch) and Query Param (for img tags/streams)
    const deviceId = req.headers['x-device-id'] || req.query.deviceId;

    if (!deviceId) {
        // No ID provided -> Unauthorized
        return res.status(401).json({ error: "No Device ID provided" });
    }

    // 4. Check status
    const device = security.getDevice(deviceId);

    if (!device) {
        // Device unknown -> Forbidden (Needs registration)
        return res.status(403).json({ error: "Device unknown", status: 'unknown' });
    }

    if (device.status !== 'approved') {
        // Device pending or rejected -> Forbidden
        return res.status(403).json({ error: "Device not approved", status: device.status, device });
    }

    // 5. Update last seen and proceed
    security.registerDevice(deviceId, device.name, req.ip, req.headers['user-agent']);
    next();
});

// --- System Endpoints ---
app.get('/api/system/ip', (req, res) => {
    const nets = os.networkInterfaces();
    const results = []; // Dictionary of networks

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                results.push(net.address);
            }
        }
    }
    // Return the first one found, or a fallback
    res.json({ ip: results[0] || 'localhost', user: os.userInfo().username });
});

// Maintenance: Git Pull / Update
app.post('/api/system/update', (req, res) => {
    console.log("System Update triggered");
    const repoRoot = path.join(__dirname, '..');
    const gitDir = path.join(repoRoot, '.git');

    if (!fs.existsSync(gitDir)) {
        return res.status(400).json({
            error: "Kein Git-Repository gefunden",
            details: "Kein .git-Verzeichnis vorhanden. Falls Docker: .git muss als Volume gemountet sein.",
            output: "Kein .git-Verzeichnis unter " + gitDir
        });
    }

    // Detect Docker environment
    const isDocker = fs.existsSync('/.dockerenv');

    if (isDocker) {
        // In Docker: fetch + checkout only server/ files (bind-mounted from host)
        const gitCmd = `git --git-dir="${gitDir}" --work-tree="${repoRoot}" fetch origin && git --git-dir="${gitDir}" --work-tree="${repoRoot}" checkout origin/main -- server/`;

        exec(gitCmd, { cwd: repoRoot }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Git update error: ${error}`);
                return res.status(500).json({
                    error: "Update fehlgeschlagen",
                    details: error.message,
                    output: `${stdout}\n${stderr}`
                });
            }

            console.log("Server files updated from origin/main");
            res.json({
                success: true,
                output: `Server-Dateien aktualisiert.\n${stdout}`,
                note: "Für Frontend-Änderungen: docker-compose up --build -d"
            });

            // Restart after response is sent (Docker restart policy restarts the container)
            setTimeout(() => {
                console.log("Restarting server after update...");
                process.exit(0);
            }, 1000);
        });
    } else {
        // Not in Docker: regular git pull
        exec('git pull', { cwd: repoRoot }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Exec error: ${error}`);
                return res.status(500).json({
                    error: "Git Pull fehlgeschlagen",
                    details: error.message,
                    output: `${stdout}\n${stderr}`
                });
            }
            console.log(`Git Pull Output: ${stdout}`);
            res.json({
                success: true,
                output: `${stdout}\n${stderr}`
            });
        });
    }
});

// Edupage Cache (declared early so clearcache can reference it)
const edupageCache = new Map();
const EDUPAGE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Maintenance: Clear Cache (Force Reload Content)
app.post('/api/system/clearcache', (req, res) => {
    console.log("System Cache cleared manually.");
    eventCache.clear();
    edupageCache.clear();
    res.json({ success: true });
});

// --- Auth Endpoints ---

// 1. Register Device
app.post('/api/auth/register', (req, res) => {
    const { id, name } = req.body;
    if (!id) return res.status(400).json({ error: "Missing ID" });

    const device = security.registerDevice(id, name, req.ip, req.headers['user-agent']);
    res.json(device);
});

// 2. Check Status
app.get('/api/auth/status', (req, res) => {
    const deviceId = req.headers['x-device-id'];
    if (!deviceId) return res.status(400).json({ error: "Missing ID" });
    const device = security.getDevice(deviceId);
    res.json(device || { status: 'unknown' });
});

// 3. Admin Login (To approve devices)
app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    // VERY BASIC AUTH for now - matches config.adminPassword or fallback
    // In a real app, hash this!
    const adminPass = appConfig.adminPassword || "1234";

    if (password === adminPass) {
        res.json({ success: true });
    } else {
        res.status(401).json({ error: "Wrong password" });
    }
});

// 4. Admin: List Devices (Protected by Admin check? For now, we trust the approved device/admin login flow context)
// Actually, admin actions should probably require the password again or a session token?
// For simplicity in this kiosk app: If you are an APPROVED device, you can list/manage others? 
// Or better: You need to pass the password header for sensitive actions?
// Let's go with: You can only call these if you are already approved (Middleware handles that).
// PLUS we can add a password check to the body if we want extra securities.
app.get('/api/auth/devices', (req, res) => {
    res.json(security.getAllDevices());
});

app.post('/api/auth/approve', (req, res) => {
    const { id, status } = req.body; // status: 'approved' | 'rejected' | 'pending'
    if (security.setDeviceStatus(id, status)) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Device not found" });
    }
});

app.delete('/api/auth/device/:id', (req, res) => {
    if (security.deleteDevice(req.params.id)) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: "Device not found" });
    }
});


let oauth2Client = null;
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/auth/google/callback"
    );
} else {
    console.warn("WARNING: Google Client ID/Secret not found. Google Auth will fail.");
}

// Token storage path
// Token storage path
// Token storage path
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const TOKEN_PATH = path.join(DATA_DIR, 'tokens.json');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const REWARDS_PATH = path.join(DATA_DIR, 'rewards_history.json');
const CATCARE_STATE_PATH = path.join(DATA_DIR, 'catcare_state.json');

let userTokens = null;
let appConfig = {};
let rewardsData = { completions: [], rewardHistory: [] };
let catCareState = { feedings: {}, lastLitterCleaned: 0 };

// Load rewards history
if (fs.existsSync(REWARDS_PATH)) {
    try {
        rewardsData = JSON.parse(fs.readFileSync(REWARDS_PATH, 'utf8'));
        console.log("Loaded rewards history from file.");
    } catch (err) {
        console.error("Failed to load rewards history:", err);
    }
}

const saveRewardsData = () => {
    fs.writeFileSync(REWARDS_PATH, JSON.stringify(rewardsData, null, 2));
};

// --- Cat Care State ---
if (fs.existsSync(CATCARE_STATE_PATH)) {
    try {
        catCareState = JSON.parse(fs.readFileSync(CATCARE_STATE_PATH, 'utf8'));
        if (!catCareState.feedings) catCareState.feedings = {};
        if (typeof catCareState.lastLitterCleaned !== 'number') catCareState.lastLitterCleaned = 0;
        console.log("Loaded catCare state from file.");
    } catch (err) {
        console.error("Failed to load catCare state:", err);
        catCareState = { feedings: {}, lastLitterCleaned: 0 };
    }
}

const saveCatCareState = () => {
    try {
        fs.writeFileSync(CATCARE_STATE_PATH, JSON.stringify(catCareState, null, 2));
    } catch (e) {
        console.error("Failed to save catCare state:", e);
    }
};

const CATCARE_DEFAULTS = {
    enabled: false,
    feedingTimes: ['07:00', '18:00'],
    gracePreMinutes: 120,
    litterEnabled: false,
    litterIntervalDays: 2,
    litterTime: '08:00'
};

const formatLocalDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const parseHHMM = (s) => {
    const [h, m] = (s || '00:00').split(':').map(Number);
    return { h: h || 0, m: m || 0 };
};

const getCatCareConfig = () => ({ ...CATCARE_DEFAULTS, ...(appConfig.catCare || {}) });

// Prune old feeding entries (keep only last 7 days) to limit state size
const pruneOldFeedings = () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = formatLocalDate(cutoff);
    let changed = false;
    for (const day of Object.keys(catCareState.feedings || {})) {
        if (day < cutoffStr) {
            delete catCareState.feedings[day];
            changed = true;
        }
    }
    return changed;
};

const computeCatCareStatus = (now = new Date()) => {
    const cfg = getCatCareConfig();
    const today = formatLocalDate(now);
    const completedToday = (catCareState.feedings[today] || []).slice();
    const times = (cfg.feedingTimes || []).slice().sort();
    const graceMs = Math.max(0, cfg.gracePreMinutes || 0) * 60 * 1000;

    const feedingTimes = times.map((t) => {
        const { h, m } = parseHHMM(t);
        const at = new Date(now);
        at.setHours(h, m, 0, 0);
        const inReach = now.getTime() >= at.getTime() - graceMs;
        const completed = completedToday.includes(t);
        return {
            time: t,
            completed,
            inReach,
            due: !completed && inReach,
            scheduledAt: at.getTime()
        };
    });

    const feedingDue = feedingTimes.some((t) => t.due);
    const allCompleted = feedingTimes.length > 0 && feedingTimes.every((t) => t.completed);

    // Next open time (chronologically) in reach
    const nextOpenInReach = feedingTimes.find((t) => !t.completed && t.inReach)?.time || null;
    const nextScheduledOpen = feedingTimes.find((t) => !t.completed)?.time || null;

    // Litter status
    let litter = null;
    if (cfg.litterEnabled) {
        const { h, m } = parseHHMM(cfg.litterTime);
        const intervalDays = Math.max(1, cfg.litterIntervalDays || 1);
        const last = catCareState.lastLitterCleaned || 0;
        // Next due: last cleaned + N days, snapped to configured HH:MM on that day.
        let nextDueAt;
        if (last <= 0) {
            const d = new Date(now);
            d.setHours(h, m, 0, 0);
            if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 1);
            nextDueAt = d.getTime();
        } else {
            const d = new Date(last);
            d.setDate(d.getDate() + intervalDays);
            d.setHours(h, m, 0, 0);
            nextDueAt = d.getTime();
        }
        litter = {
            enabled: true,
            due: now.getTime() >= nextDueAt,
            lastCleaned: last || null,
            nextDueAt
        };
    } else {
        litter = { enabled: false, due: false, lastCleaned: null, nextDueAt: null };
    }

    return {
        enabled: !!cfg.enabled,
        config: cfg,
        feeding: {
            times: feedingTimes,
            completedToday,
            due: feedingDue,
            allCompleted,
            nextOpenInReach,
            nextScheduledOpen
        },
        litter,
        now: now.getTime()
    };
};

// Load tokens on startup
if (fs.existsSync(TOKEN_PATH)) {
    try {
        const data = fs.readFileSync(TOKEN_PATH, 'utf8');
        userTokens = JSON.parse(data);
        if (oauth2Client) {
            oauth2Client.setCredentials(userTokens);
            console.log("Loaded Google tokens from file.");
        }
    } catch (err) {
        console.error("Failed to load tokens:", err);
    }
}

// Auto-Save Tokens on Refresh
if (oauth2Client) {
    oauth2Client.on('tokens', (tokens) => {
        if (tokens.refresh_token) {
            console.log("New Refresh Token received via auto-refresh!");
        }
        console.log("Google Access Token refreshed automatically. Saving to disk...");
        // Merge with existing to ensure we don't lose the refresh_token if the update only has access_token
        userTokens = { ...userTokens, ...tokens };
        try {
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(userTokens));
            console.log("Tokens saved to tokens.json");
        } catch (e) {
            console.error("Failed to save refreshed tokens:", e);
        }
    });
}

// Load config on startup
if (fs.existsSync(CONFIG_PATH)) {
    try {
        appConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        console.log("Loaded AppConfig from file.");
    } catch (err) {
        console.error("Failed to load config:", err);
    }
}

// Event Cache
const eventCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 Minutes

// --- CHORE ROTATION ---
import { checkAndRotateChores, grantChoreStars, revokeChoreStars } from './choreLogic.js';
import {
    loadBathroomState, saveBathroomState,
    computeActiveWindow, reconcileWindow, nextWindowInfo
} from './bathroomState.js';
import { computeNextDue, sortByDueDate } from './householdLogic.js';

// Household undo shadow: taskId -> { priorNextDueAt, priorLastCompletedAt, priorLastCompletedBy, completedAt }
const householdUndoShadow = new Map();
const HOUSEHOLD_UNDO_WINDOW_MS = 30_000;

const performRotationCheck = () => {
    if (!appConfig.chores) return;

    const rotationResult = checkAndRotateChores(appConfig);
    if (rotationResult) {
        console.log("Rotating Chores...", rotationResult);
        const newConfig = {
            ...appConfig,
            chores: {
                ...appConfig.chores,
                tasks: rotationResult.tasks,
                settings: {
                    ...appConfig.chores.settings,
                    ...rotationResult.settings
                }
            }
        };

        appConfig = newConfig;
        try {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
            console.log("Rotated chores saved to config.");
        } catch (e) {
            console.error("Failed to save rotated chores:", e);
        }
    }
};

// Check on startup
if (appConfig.chores) {
    performRotationCheck();
}

// Check periodially (e.g. every hour)
setInterval(performRotationCheck, 60 * 60 * 1000);

// --- Config Endpoints ---
app.get('/api/config', (req, res) => {
    res.json(appConfig);
});

app.post('/api/config', (req, res) => {
    try {
        const newConfig = { ...appConfig, ...req.body };

        // Household: unconditionally recompute nextDueAt for every task so
        // recurrence/startDate edits propagate, and brand-new tasks get a
        // sensible initial value without client-side date math.
        if (newConfig.household?.tasks) {
            for (const t of newConfig.household.tasks) {
                try {
                    const anchor = t.lastCompletedAt ?? Date.now();
                    t.nextDueAt = computeNextDue(t, anchor);
                } catch (err) {
                    console.warn(`[household] normalize failed for task ${t?.id}:`, err.message);
                }
            }
        }

        appConfig = newConfig;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
        console.log("Config saved.");
        // Broadcast cat care / note updates so other dashboards pick them up
        try { broadcastEvent('catcare', computeCatCareStatus()); } catch {}
        try { broadcastEvent('note', appConfig.note || { text: '', updatedAt: 0 }); } catch {}
        res.json({ success: true, config: appConfig });
    } catch (err) {
        console.error("Failed to save config:", err);
        res.status(500).json({ error: "Failed to save config" });
    }
});

// --- Cat Care Endpoints ---
app.get('/api/catcare/status', (req, res) => {
    res.json(computeCatCareStatus());
});

app.post('/api/catcare/feed', (req, res) => {
    const cfg = getCatCareConfig();
    if (!cfg.enabled) return res.status(400).json({ error: 'Cat care not enabled' });

    const now = new Date();
    const today = formatLocalDate(now);
    if (!catCareState.feedings[today]) catCareState.feedings[today] = [];
    const completed = catCareState.feedings[today];
    const times = (cfg.feedingTimes || []).slice().sort();
    const graceMs = Math.max(0, cfg.gracePreMinutes || 0) * 60 * 1000;

    // Optional explicit time in body: mark exactly that (toggle-safe)
    const bodyTime = typeof req.body?.time === 'string' ? req.body.time : null;

    let markedTime = null;
    if (bodyTime && times.includes(bodyTime)) {
        if (!completed.includes(bodyTime)) {
            completed.push(bodyTime);
            markedTime = bodyTime;
        }
    } else {
        // Mark next open time that is "in reach" (>= scheduled - grace)
        for (const t of times) {
            if (completed.includes(t)) continue;
            const { h, m } = parseHHMM(t);
            const at = new Date(now);
            at.setHours(h, m, 0, 0);
            if (now.getTime() >= at.getTime() - graceMs) {
                completed.push(t);
                markedTime = t;
                break;
            }
        }
    }

    if (!markedTime) {
        return res.status(200).json({
            success: false,
            reason: 'Keine Fütterungszeit im aktuellen Fenster offen.',
            status: computeCatCareStatus(now)
        });
    }

    pruneOldFeedings();
    saveCatCareState();
    const status = computeCatCareStatus(now);
    broadcastEvent('catcare', status);
    res.json({ success: true, marked: markedTime, status });
});

app.post('/api/catcare/feed/undo', (req, res) => {
    const cfg = getCatCareConfig();
    if (!cfg.enabled) return res.status(400).json({ error: 'Cat care not enabled' });
    const now = new Date();
    const today = formatLocalDate(now);
    const completed = catCareState.feedings[today] || [];
    const bodyTime = typeof req.body?.time === 'string' ? req.body.time : null;

    let removed = null;
    if (bodyTime && completed.includes(bodyTime)) {
        catCareState.feedings[today] = completed.filter((t) => t !== bodyTime);
        removed = bodyTime;
    } else if (completed.length > 0) {
        // Remove most recent (last in chronological sort)
        const sorted = completed.slice().sort();
        removed = sorted[sorted.length - 1];
        catCareState.feedings[today] = completed.filter((t) => t !== removed);
    }

    if (!removed) {
        return res.json({ success: false, status: computeCatCareStatus(now) });
    }
    saveCatCareState();
    const status = computeCatCareStatus(now);
    broadcastEvent('catcare', status);
    res.json({ success: true, removed, status });
});

app.post('/api/catcare/litter', (req, res) => {
    const cfg = getCatCareConfig();
    if (!cfg.enabled || !cfg.litterEnabled) {
        return res.status(400).json({ error: 'Litter tracking not enabled' });
    }
    catCareState.lastLitterCleaned = Date.now();
    saveCatCareState();
    const status = computeCatCareStatus();
    broadcastEvent('catcare', status);
    res.json({ success: true, status });
});

// --- Note Endpoint (globale Familien-Notiz) ---
app.get('/api/note', (req, res) => {
    res.json(appConfig.note || { text: '', updatedAt: 0 });
});

app.post('/api/note', (req, res) => {
    try {
        const text = typeof req.body?.text === 'string' ? req.body.text : '';
        const author = typeof req.body?.author === 'string' ? req.body.author : undefined;
        const note = { text, updatedAt: Date.now(), author };
        appConfig.note = note;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
        broadcastEvent('note', note);
        res.json({ success: true, note });
    } catch (err) {
        console.error('Failed to save note:', err);
        res.status(500).json({ error: 'Failed to save note' });
    }
});

// Backup & Restore - Complete backup includes ALL settings and history
app.get('/api/config/backup', (req, res) => {
    const backup = {
        version: 3,  // v3: includes rewardsHistory
        timestamp: new Date().toISOString(),
        config: appConfig,
        googleTokens: userTokens,
        rewardsHistory: rewardsData
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=homedashboard-backup.json');
    res.json(backup);
});

app.post('/api/config/restore', (req, res) => {
    try {
        const data = req.body;

        if (typeof data !== 'object') {
            return res.status(400).send("Invalid backup format");
        }

        // Handle v2/v3 backup format (with version field)
        if (data.version >= 2) {
            console.log(`Restoring v${data.version} backup from`, data.timestamp || 'unknown date');

            // Restore config
            if (data.config) {
                appConfig = data.config;
                fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
                console.log("Config restored from backup.");
            }

            // Restore Google OAuth tokens
            if (data.googleTokens) {
                userTokens = data.googleTokens;
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(userTokens));
                if (oauth2Client) {
                    oauth2Client.setCredentials(userTokens);
                }
                console.log("Google tokens restored from backup.");
            }

            // Restore rewards history (v3+)
            if (data.rewardsHistory) {
                rewardsData = data.rewardsHistory;
                saveRewardsData();
                console.log("Rewards history restored from backup.");
            }
        } else {
            // Legacy v1 backup (only config, no version field)
            console.log("Restoring legacy v1 backup");
            appConfig = data;
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
            console.log("Config restored from backup (legacy format).");
        }

        res.json({ success: true, message: "Backup vollständig wiederhergestellt" });
    } catch (err) {
        console.error("Restore failed:", err);
        res.status(500).send("Restore failed: " + err.message);
    }
});





// --- GOOGLE AUTH ROUTES ---

app.get('/auth/google', (req, res) => {
    if (!oauth2Client) {
        return res.status(500).json({ error: "Server missing Google Credentials in .env" });
    }
    const scopes = [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events.readonly'
    ];
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Request refresh token
        scope: scopes,
        prompt: 'consent' // Force new refresh token
    });
    res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
    if (!oauth2Client) {
        return res.redirect('/admin/settings?googleAuth=error_missing_creds');
    }
    const { code } = req.query;
    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        // Merge with existing to keep any other props, though 'tokens' usually has what we need.
        // Importantly, 'prompt: consent' ensures we get a refresh_token this time.
        userTokens = { ...userTokens, ...tokens };

        // Save tokens to file
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(userTokens));
        console.log("Google tokens acquired and saved to file.");

        // Redirect back to Frontend Admin Settings (Relative path works because of Nginx proxy)
        res.redirect('/admin/settings?googleAuth=success');
    } catch (error) {
        console.error("Error retrieving access token", error);
        res.redirect('/admin/settings?googleAuth=error');
    }
});

app.get('/api/google/calendars', async (req, res) => {
    if (!userTokens) {
        return res.status(401).json({ error: "Not authenticated with Google" });
    }
    try {
        oauth2Client.setCredentials(userTokens);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        const response = await calendar.calendarList.list();
        res.json(response.data.items);
    } catch (error) {
        console.error("Error fetching calendars", error);
        res.status(500).json({ error: "Failed to fetch calendars" });
    }
});

app.post('/api/google/events', async (req, res) => {
    if (!userTokens) {
        return res.status(401).json({ error: "Not authenticated with Google" });
    }
    const { calendarIds } = req.body; // Array of calendar IDs
    console.log("DEBUG: Fetching events for calendars:", calendarIds);
    if (!oauth2Client) return res.status(500).json({ error: "Google Auth not configured" });

    // Check Cache
    const cacheKey = JSON.stringify(req.body);
    const cached = eventCache.get(cacheKey);
    const pollInterval = appConfig.google?.pollInterval || (10 * 60 * 1000);

    if (cached && (Date.now() - cached.timestamp < pollInterval)) {
        console.log("Serving events from cache");
        return res.json(cached.data);
    }

    const { timeMin, timeMax } = req.body;

    if (!calendarIds || !Array.isArray(calendarIds)) {
        return res.status(400).json({ error: "Missing calendarIds" });
    }

    // Default to starts of today if not provided
    // const startOfDay = new Date();
    // startOfDay.setHours(0, 0, 0, 0);
    // const timeMinParam = timeMin || startOfDay.toISOString();

    // Default range logic (if not provided)
    const now = new Date();
    const tMin = timeMin || new Date(now.setHours(0, 0, 0, 0)).toISOString();
    const tMax = timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        let allEvents = [];

        let authError = null;

        for (const calId of calendarIds) {
            try {
                const response = await calendar.events.list({
                    calendarId: calId,
                    timeMin: tMin,
                    timeMax: tMax,
                    singleEvents: true,
                    orderBy: 'startTime',
                });

                const events = response.data.items.map(event => ({
                    id: event.id,
                    summary: event.summary,
                    start: event.start,
                    end: event.end,
                    calendarId: calId, // Tag with source calendar
                    description: event.description,
                    location: event.location
                }));

                allEvents = [...allEvents, ...events];
            } catch (err) {
                console.error(`Failed to fetch for ${calId}:`, err.message);
                if (err.message && (err.message.includes('No refresh token') || err.message.includes('invalid_grant'))) {
                    authError = err;
                }
            }
        }

        // If we faced an auth error and got no events (or even if we did?), report it.
        // Prioritize reporting the auth error if the result implies total failure.
        if (authError && allEvents.length === 0) {
            console.error("Google Auth seems broken, returning 401");
            return res.status(401).json({ error: "Google Auth Expired or Invalid", details: authError.message });
        }

        // Save to Cache
        eventCache.set(cacheKey, { timestamp: Date.now(), data: allEvents });

        res.json(allEvents);

    } catch (err) {
        console.error("Google API Error", err);
        res.status(500).json({ error: "Failed to fetch events" });
    }
});

// --- NOTION ROUTES ---

app.get('/api/notion/notes', async (req, res) => {
    const { notionKey, notionDatabaseId } = appConfig;

    if (!notionKey || !notionDatabaseId) {
        return res.status(400).json({ error: "Notion not configured (Key or DB ID missing)" });
    }

    try {
        console.log("Fetching Notion data via direct HTTP...");

        const response = await fetch(`https://api.notion.com/v1/databases/${notionDatabaseId}/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${notionKey}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filter: {
                    and: [
                        {
                            property: 'Gebiet',
                            multi_select: {
                                contains: 'Privat'
                            }
                        },
                        {
                            property: 'Status',
                            status: {
                                does_not_equal: 'erledigt'
                            }
                        },
                        {
                            property: 'Status',
                            status: {
                                does_not_equal: 'abgebrochen'
                            }
                        }
                    ]
                },
                sorts: [
                    {
                        property: 'Ziel',
                        direction: 'ascending',
                    },
                ],
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error("Notion API Error Body:", errBody);
            throw new Error(`Notion API Status ${response.status}: ${errBody}`);
        }

        const data = await response.json();

        // Map to internal Note format
        const notes = data.results.map(page => {
            const props = page.properties;

            // Extract content from "Name" (Title property)
            const titleObj = props.Name?.title || [];
            const content = titleObj.map(t => t.plain_text).join("") || "Neue Notiz";

            // Extract Description
            const descObj = props.Beschreibung?.rich_text || [];
            const description = descObj.map(t => t.plain_text).join("");

            // Extract Target Date (Ziel)
            // Fallback to created_time if Ziel is not set
            const targetDate = props.Ziel?.date?.start || page.created_time;

            // Map Notion colors to Tailwind classes
            const p = props.P;
            let notionColor = 'default';

            if (p) {
                if (p.type === 'select') notionColor = p.select?.color;
                else if (p.type === 'status') notionColor = p.status?.color;
                else if (p.type === 'multi_select') notionColor = p.multi_select?.[0]?.color;
            }

            const colorMap = {
                red: 'bg-red-200',
                green: 'bg-green-200',
                blue: 'bg-blue-200',
                yellow: 'bg-yellow-200',
                orange: 'bg-orange-200',
                purple: 'bg-purple-200',
                pink: 'bg-pink-200',
                brown: 'bg-amber-200',
                gray: 'bg-slate-200',
                default: 'bg-yellow-200'
            };
            const color = colorMap[notionColor] || 'bg-yellow-200';

            return {
                id: page.id,
                content: content,
                description: description,
                author: "Notion",
                createdAt: targetDate, // Mapping 'Ziel' to createdAt field for now to match interface, or rename? 
                // Better to send explicit field but frontend uses createdAt. 
                // User requested "Target date instead of creation date".
                // I will map it here to 'targetDate' and also keep createdAt as actual created time,
                // but I'll update frontend to use targetDate.
                targetDate: targetDate,
                color: color
            };
        });

        res.json(notes);

    } catch (error) {
        console.error("Notion Fetch Error:", error);
        res.status(500).json({ error: `Notion Error: ${error.message}` });
    }
});

// --- REWARDS ROUTES ---

// Complete a task (with PIN verification)
app.post('/api/rewards/complete', (req, res) => {
    const { taskId, kidId, pin } = req.body;

    const adminPin = appConfig.adminPin || '1234';
    if (pin !== adminPin) {
        return res.status(401).json({ error: 'Falsche PIN' });
    }

    try {
        const { entry, rewards } = grantChoreStars(appConfig, rewardsData, {
            taskId, kidId, source: 'chore'
        });
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
        saveRewardsData();
        res.json({ success: true, entry, rewards });
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
});

// Get completion history
app.get('/api/rewards/history', (req, res) => {
    const { kidId, limit } = req.query;
    let results = [...rewardsData.completions];

    // Filter out completions from before the last reward claim
    // so the history matches the current star count
    const rewardHistory = rewardsData.rewardHistory || [];
    if (rewardHistory.length > 0) {
        // Build a map of the last reset time per kid (and a global reset time)
        let globalResetTime = 0;
        const kidResetTimes = {};
        for (const claim of rewardHistory) {
            const t = claim.claimedAt || 0;
            if (claim.claimedBy === 'all' || claim.claimedBy === 'shared' || claim.claimedBy === 'individual') {
                globalResetTime = Math.max(globalResetTime, t);
            } else if (claim.claimedBy) {
                kidResetTimes[claim.claimedBy] = Math.max(kidResetTimes[claim.claimedBy] || 0, t);
            }
        }
        results = results.filter(c => {
            const resetTime = Math.max(globalResetTime, kidResetTimes[c.kidId] || 0);
            return c.timestamp > resetTime;
        });
    }

    if (kidId) {
        results = results.filter(c => c.kidId === kidId);
    }

    results.sort((a, b) => b.timestamp - a.timestamp);

    if (limit) {
        results = results.slice(0, parseInt(limit));
    }

    res.json({
        completions: results,
        rewardHistory: rewardsData.rewardHistory || []
    });
});

// Claim a reward (reset stars, set new reward)
app.post('/api/rewards/claim', (req, res) => {
    const { pin, kidId, newReward, newTarget } = req.body;

    const adminPin = appConfig.adminPin || '1234';
    if (pin !== adminPin) {
        return res.status(401).json({ error: 'Falsche PIN' });
    }

    const archived = {
        reward: appConfig.rewards?.currentReward || 'Unbekannt',
        claimedAt: Date.now(),
        claimedBy: kidId || (appConfig.rewards?.mode === 'shared' ? 'all' : 'individual'),
        totalStars: appConfig.rewards?.mode === 'shared'
            ? appConfig.rewards.sharedStars
            : appConfig.rewards?.kidStars
    };
    rewardsData.rewardHistory.push(archived);

    if (appConfig.rewards.mode === 'shared') {
        appConfig.rewards.sharedStars = 0;
    } else if (kidId) {
        // Reset only specific kid
        if (appConfig.rewards.kidStars) {
            appConfig.rewards.kidStars[kidId] = 0;
        }
    } else {
        // Reset all kids
        appConfig.rewards.kidStars = {};
    }

    if (newReward !== undefined) appConfig.rewards.currentReward = newReward;
    if (newTarget) appConfig.rewards.targetStars = newTarget;

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
    saveRewardsData();

    res.json({ success: true, rewards: appConfig.rewards });
});

// Award bonus stars manually (from admin panel)
app.post('/api/rewards/bonus', (req, res) => {
    const { kidId, stars, reason } = req.body;

    if (!kidId || !stars || stars < 1 || stars > 5) {
        return res.status(400).json({ error: 'Ungültige Daten (kidId, stars 1-5 erforderlich)' });
    }

    const kid = appConfig.chores?.kids?.find(k => k.id === kidId);
    if (!kid) {
        return res.status(404).json({ error: 'Kind nicht gefunden' });
    }

    const entry = {
        id: Date.now().toString(),
        taskId: 'bonus',
        taskLabel: reason || 'Bonus-Sterne',
        kidId: kid.id,
        kidName: kid.name,
        stars: parseInt(stars),
        timestamp: Date.now()
    };
    rewardsData.completions.push(entry);

    if (!appConfig.rewards) {
        appConfig.rewards = { mode: 'individual', targetStars: 20, currentReward: '', kidStars: {}, sharedStars: 0 };
    }

    if (appConfig.rewards.mode === 'shared') {
        appConfig.rewards.sharedStars = (appConfig.rewards.sharedStars || 0) + parseInt(stars);
    } else {
        if (!appConfig.rewards.kidStars) appConfig.rewards.kidStars = {};
        appConfig.rewards.kidStars[kid.id] = (appConfig.rewards.kidStars[kid.id] || 0) + parseInt(stars);
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
    saveRewardsData();

    res.json({ success: true, entry, rewards: appConfig.rewards });
});

import { spawn } from 'child_process';

app.get('/api/camera/stream', (req, res) => {
    const streamUrl = appConfig.cameraUrl;

    if (!streamUrl) {
        return res.status(404).send("Camera URL not configured");
    }

    console.log("Starting Stream for:", streamUrl);

    const BOUNDARY = 'frameboundary';

    res.writeHead(200, {
        'Content-Type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
        'Cache-Control': 'no-cache',
        'Connection': 'close',
        'Pragma': 'no-cache'
    });

    const ffmpeg = spawn('ffmpeg', [
        '-probesize', '64000',
        '-analyzeduration', '0',
        '-rtsp_transport', 'tcp',
        '-i', streamUrl,
        '-vf', 'scale=800:-1',
        '-f', 'image2pipe',
        '-vcodec', 'mjpeg',
        '-q:v', '8',
        '-r', '10',
        '-'
    ]);

    // Parse raw JPEG frames from ffmpeg and wrap in multipart boundaries
    let buffer = Buffer.alloc(0);
    const JPEG_START = Buffer.from([0xFF, 0xD8]);
    const JPEG_END = Buffer.from([0xFF, 0xD9]);

    ffmpeg.stdout.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        // Find complete JPEG frames in the buffer
        while (true) {
            const startIdx = buffer.indexOf(JPEG_START);
            if (startIdx === -1) break;

            const endIdx = buffer.indexOf(JPEG_END, startIdx + 2);
            if (endIdx === -1) break; // Incomplete frame, wait for more data

            // Extract complete JPEG frame (including the 2-byte end marker)
            const frame = buffer.subarray(startIdx, endIdx + 2);
            buffer = buffer.subarray(endIdx + 2);

            // Send as multipart chunk
            try {
                res.write(`\r\n--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
                res.write(frame);
            } catch (e) {
                // Client disconnected
                break;
            }
        }

        // Prevent buffer from growing too large (discard stale data before any JPEG start)
        const lastStart = buffer.indexOf(JPEG_START);
        if (lastStart > 0) {
            buffer = buffer.subarray(lastStart);
        } else if (lastStart === -1 && buffer.length > 200000) {
            buffer = Buffer.alloc(0);
        }
    });

    ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        // Only log actual errors, not progress info
        if (msg.includes('Error') || msg.includes('error')) {
            console.error(`FFMPEG Error: ${msg}`);
        }
    });

    ffmpeg.on('close', (code) => {
        console.log(`FFMPEG stream process exited with code ${code}`);
        try { res.end(); } catch (e) { /* already closed */ }
    });

    req.on('close', () => {
        console.log("Client disconnected, killing ffmpeg");
        ffmpeg.kill('SIGKILL');
    });
});

app.get('/api/camera/snapshot', (req, res) => {
    const streamUrl = appConfig.cameraUrl;
    if (!streamUrl) return res.status(404).send("No Camera URL");

    const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-rtsp_transport', 'tcp',
        '-i', streamUrl,
        '-frames:v', '1',
        '-f', 'image2',
        '-vf', 'scale=800:-1',
        '-q:v', '5',
        '-'
    ]);

    res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });
    ffmpeg.stdout.pipe(res);
});

// --- Edupage Proxy (with cache) ---
app.get('/api/edupage', (req, res) => {
    const username = req.headers['username'];
    const password = req.headers['password'];
    // Default to "login1" if not provided header (though bridge script also defaults)
    const subdomain = req.headers['subdomain'] || 'login1';
    const date = req.query.date; // Optional date YYYY-MM-DD

    // Validate credentials presence
    if (!username || !password) {
        return res.status(400).send("Missing credentials");
    }

    // Check cache
    const cacheKey = `${username}:${subdomain}:${date || 'today'}`;
    const cached = edupageCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < EDUPAGE_CACHE_TTL)) {
        console.log(`Serving Edupage data from cache (key: ${cacheKey})`);
        return res.json(cached.data);
    }

    const scriptPath = path.join(__dirname, 'edupage_bridge_v2.py');
    console.log(`DEBUG: Executing Python script at: ${scriptPath} with subdomain: ${subdomain} and date: ${date}`);

    const args = [scriptPath, username, password, subdomain];
    if (date) {
        args.push(date);
    }

    // Execute python script
    execFile('python', args, (error, stdout, stderr) => {
        // Always log stderr for debugging
        if (stderr) {
            console.error('Wrapper Stderr:', stderr);
        }

        // Parse output regardless of error code, as script might print JSON error then exit 1
        let data = null;
        try {
            if (stdout) {
                data = JSON.parse(stdout);
            }
        } catch (e) {
            console.error('Failed to parse script output', e);
        }

        if (error && !data) {
            console.error('Edupage Script Error:', error);
            return res.status(500).send("Failed to execute Edupage script");
        }

        if (data && data.error) {
            console.error("Edupage Logic Error:", data.error);
            return res.status(401).send(data.error);
        }

        if (data) {
            // Store in cache
            edupageCache.set(cacheKey, { timestamp: Date.now(), data });
            res.json(data);
        } else {
            res.status(500).send("No data returned from Edupage script");
        }
    });
});

// --- SONOS ROUTES ---

// Get speakers with live state (uses cached speaker list from boot discovery)
app.get('/api/sonos/speakers', async (req, res) => {
    try {
        const speakers = await sonos.getSpeakersWithState();
        res.json(speakers);
    } catch (err) {
        console.error('Sonos speakers error:', err);
        res.status(500).json({ error: 'Speaker-Status fehlgeschlagen', details: err.message });
    }
});

// Trigger new discovery (from admin panel)
app.post('/api/sonos/discover', async (req, res) => {
    try {
        const speakers = await sonos.runDiscovery();
        res.json({ success: true, count: speakers.length, speakers });
    } catch (err) {
        console.error('Sonos discovery error:', err);
        res.status(500).json({ error: 'Speaker-Erkennung fehlgeschlagen', details: err.message });
    }
});

// Get single speaker state
app.get('/api/sonos/state', async (req, res) => {
    const { ip } = req.query;
    if (!ip) return res.status(400).json({ error: 'IP fehlt' });
    try {
        const state = await sonos.getSpeakerState(ip);
        res.json(state);
    } catch (err) {
        res.status(500).json({ error: 'Status konnte nicht abgerufen werden', details: err.message });
    }
});

// Transport controls
app.post('/api/sonos/play', async (req, res) => {
    const { ip, uri } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP fehlt' });
    try {
        await sonos.play(ip, uri);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Play fehlgeschlagen', details: err.message });
    }
});

app.post('/api/sonos/pause', async (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP fehlt' });
    try {
        await sonos.pause(ip);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Pause fehlgeschlagen', details: err.message });
    }
});

app.post('/api/sonos/stop', async (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP fehlt' });
    try {
        await sonos.stop(ip);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Stop fehlgeschlagen', details: err.message });
    }
});

app.post('/api/sonos/next', async (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP fehlt' });
    try {
        await sonos.next(ip);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Next fehlgeschlagen', details: err.message });
    }
});

app.post('/api/sonos/previous', async (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP fehlt' });
    try {
        await sonos.previous(ip);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Previous fehlgeschlagen', details: err.message });
    }
});

app.post('/api/sonos/volume', async (req, res) => {
    const { ip, volume } = req.body;
    if (!ip || volume === undefined) return res.status(400).json({ error: 'IP oder Volume fehlt' });
    try {
        await sonos.setVolume(ip, Math.max(0, Math.min(100, volume)));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Volume fehlgeschlagen', details: err.message });
    }
});

app.post('/api/sonos/mute', async (req, res) => {
    const { ip, muted } = req.body;
    if (!ip || muted === undefined) return res.status(400).json({ error: 'IP oder Muted fehlt' });
    try {
        await sonos.setMuted(ip, muted);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Mute fehlgeschlagen', details: err.message });
    }
});

app.post('/api/sonos/seek', async (req, res) => {
    const { ip, seconds } = req.body;
    if (!ip || seconds === undefined) return res.status(400).json({ error: 'IP oder Sekunden fehlt' });
    try {
        await sonos.seek(ip, seconds);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Seek fehlgeschlagen', details: err.message });
    }
});

// Favorites & Playlists
app.get('/api/sonos/favorites', async (req, res) => {
    const { ip } = req.query;
    if (!ip) return res.status(400).json({ error: 'IP fehlt' });
    try {
        const favorites = await sonos.getFavorites(ip);
        res.json(favorites);
    } catch (err) {
        res.status(500).json({ error: 'Favoriten konnten nicht geladen werden', details: err.message });
    }
});

app.get('/api/sonos/playlists', async (req, res) => {
    const { ip } = req.query;
    if (!ip) return res.status(400).json({ error: 'IP fehlt' });
    try {
        const playlists = await sonos.getPlaylists(ip);
        res.json(playlists);
    } catch (err) {
        res.status(500).json({ error: 'Playlisten konnten nicht geladen werden', details: err.message });
    }
});

app.post('/api/sonos/play-favorite', async (req, res) => {
    const { ip, uri, metadata } = req.body;
    if (!ip || !uri) return res.status(400).json({ error: 'IP oder URI fehlt' });
    try {
        await sonos.playFavorite(ip, uri, metadata);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Favorit konnte nicht abgespielt werden', details: err.message });
    }
});

// Radio
app.get('/api/sonos/radio', async (req, res) => {
    const { ip, category } = req.query;
    if (!ip) return res.status(400).json({ error: 'IP fehlt' });
    try {
        const stations = await sonos.browseRadio(ip, category);
        res.json(stations);
    } catch (err) {
        res.status(500).json({ error: 'Radio konnte nicht geladen werden', details: err.message });
    }
});

// Music Library Search
app.get('/api/sonos/search', async (req, res) => {
    const { ip, type, term } = req.query;
    if (!ip || !term) return res.status(400).json({ error: 'IP oder Suchbegriff fehlt' });
    try {
        const searchType = type || 'tracks'; // tracks, albums, artists, playlists
        const results = await sonos.searchMusicLibrary(ip, searchType, term);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: 'Suche fehlgeschlagen', details: err.message });
    }
});

// Queue
app.get('/api/sonos/queue', async (req, res) => {
    const { ip } = req.query;
    if (!ip) return res.status(400).json({ error: 'IP fehlt' });
    try {
        const queue = await sonos.getQueue(ip);
        res.json(queue);
    } catch (err) {
        res.status(500).json({ error: 'Queue konnte nicht geladen werden', details: err.message });
    }
});

app.post('/api/sonos/queue/add', async (req, res) => {
    const { ip, uri, metadata } = req.body;
    if (!ip || !uri) return res.status(400).json({ error: 'IP oder URI fehlt' });
    try {
        await sonos.addToQueue(ip, uri, metadata);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Zur Queue hinzufuegen fehlgeschlagen', details: err.message });
    }
});

app.post('/api/sonos/queue/clear', async (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP fehlt' });
    try {
        await sonos.clearQueue(ip);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Queue leeren fehlgeschlagen', details: err.message });
    }
});

app.post('/api/sonos/queue/play', async (req, res) => {
    const { ip, position } = req.body;
    if (!ip || position === undefined) return res.status(400).json({ error: 'IP oder Position fehlt' });
    try {
        await sonos.playFromQueue(ip, position);
        await sonos.play(ip);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Queue abspielen fehlgeschlagen', details: err.message });
    }
});

// Groups
app.get('/api/sonos/groups', async (req, res) => {
    const { ip } = req.query;
    if (!ip) return res.status(400).json({ error: 'IP fehlt' });
    try {
        const groups = await sonos.getGroups(ip);
        res.json(groups);
    } catch (err) {
        res.status(500).json({ error: 'Gruppen konnten nicht geladen werden', details: err.message });
    }
});

app.post('/api/sonos/group/join', async (req, res) => {
    const { ip, coordinatorIp } = req.body;
    if (!ip || !coordinatorIp) return res.status(400).json({ error: 'IPs fehlen' });
    try {
        await sonos.joinGroup(ip, coordinatorIp);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Gruppe beitreten fehlgeschlagen', details: err.message });
    }
});

app.post('/api/sonos/group/leave', async (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ error: 'IP fehlt' });
    try {
        await sonos.leaveGroup(ip);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Gruppe verlassen fehlgeschlagen', details: err.message });
    }
});

// --- iCloud Shared Album Proxy ---
// Returns the photo list for a shared iCloud album. The album link must be
// configured in the screensaver settings. Results are cached for ~30 minutes
// inside icloud.js so the dashboard can poll cheaply.
app.get('/api/icloud/album', async (req, res) => {
    const url = req.query.url;
    if (!url) {
        return res.status(400).json({ error: 'url-Parameter fehlt' });
    }
    try {
        const result = await getSharedAlbumPhotos(url);
        res.json(result);
    } catch (err) {
        console.error('iCloud album fetch failed:', err.message);
        res.status(502).json({ error: 'iCloud-Album konnte nicht geladen werden', details: err.message });
    }
});

app.post('/api/icloud/album/refresh', (req, res) => {
    clearAlbumCache();
    res.json({ success: true });
});

// Debug endpoint: returns the raw share.icloud.com discovery result so the
// operator can inspect what Apple actually responds with for a given album.
app.get('/api/icloud/debug', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'url-Parameter fehlt' });
    try {
        const result = await debugSharedAlbum(url);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SSE (Server-Sent Events) for Real-time Triggers (Doorbell) ---
const sseClients = new Set();

app.get('/api/stream/events', (req, res) => {
    // SSE Setup
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    res.write('\n');

    // Add client
    sseClients.add(res);

    // Remove on close
    req.on('close', () => {
        sseClients.delete(res);
    });
});

// Broadcast helper
const broadcastEvent = (type, data) => {
    sseClients.forEach(client => {
        client.write(`event: ${type}\n`);
        client.write(`data: ${JSON.stringify(data)}\n\n`);
    });
};

// Doorbell Webhook
app.post('/api/webhook/doorbell', (req, res) => {
    console.log("Doorbell Triggered! Broadcasting to", sseClients.size, "clients.");
    broadcastEvent('doorbell', { timestamp: Date.now() });
    res.json({ success: true, clients: sseClients.size });
});

// --- KEYBOARD REMOTE CONTROL ---
let isKeyboardActive = false;

app.post('/api/system/keyboard', (req, res) => {
    const { active } = req.body;
    if (typeof active !== 'boolean') {
        return res.status(400).json({ error: "Invalid payload" });
    }

    isKeyboardActive = active;
    console.log(`Keyboard ${active ? 'ACTIVATED' : 'DEACTIVATED'} remotely.`);

    // Broadcast to all clients
    broadcastEvent('keyboard', { active });

    res.json({ success: true, active: isKeyboardActive });
});

// Send current state on connection
// We need to modify the SSE setup slightly to send initial state,
// or clients can fetch it. Ideally SSE sends it on connect.


// --- HOUSEHOLD ROUTES ---

app.get('/api/household/tasks', (req, res) => {
    const h = appConfig.household || { members: [], tasks: [] };
    res.json({
        tasks: sortByDueDate(h.tasks || []),
        members: h.members || [],
        now: Date.now()
    });
});

app.post('/api/household/complete', (req, res) => {
    const { taskId, memberId } = req.body || {};
    if (!taskId) return res.status(400).json({ error: 'taskId missing' });

    const h = appConfig.household || { members: [], tasks: [] };
    const task = (h.tasks || []).find(t => t.id === taskId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    householdUndoShadow.set(task.id, {
        priorNextDueAt: task.nextDueAt,
        priorLastCompletedAt: task.lastCompletedAt,
        priorLastCompletedBy: task.lastCompletedBy,
        completedAt: Date.now()
    });
    setTimeout(() => {
        const s = householdUndoShadow.get(task.id);
        if (s && Date.now() - s.completedAt >= HOUSEHOLD_UNDO_WINDOW_MS) {
            householdUndoShadow.delete(task.id);
        }
    }, HOUSEHOLD_UNDO_WINDOW_MS + 100);

    const now = Date.now();
    task.lastCompletedAt = now;
    task.lastCompletedBy = memberId || task.assignedTo || null;
    try {
        task.nextDueAt = computeNextDue(task, now);
    } catch (err) {
        return res.status(400).json({ error: `Invalid recurrence: ${err.message}` });
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
    res.json({ task, completedAt: now });
});

app.post('/api/household/undo', (req, res) => {
    const { taskId } = req.body || {};
    if (!taskId) return res.status(400).json({ error: 'taskId missing' });

    const shadow = householdUndoShadow.get(taskId);
    if (!shadow) return res.status(410).json({ error: 'No recent completion' });
    if (Date.now() - shadow.completedAt > HOUSEHOLD_UNDO_WINDOW_MS) {
        householdUndoShadow.delete(taskId);
        return res.status(410).json({ error: 'Undo window expired' });
    }

    const h = appConfig.household || { members: [], tasks: [] };
    const task = (h.tasks || []).find(t => t.id === taskId);
    if (!task) {
        householdUndoShadow.delete(taskId);
        return res.status(404).json({ error: 'Task not found' });
    }

    task.nextDueAt = shadow.priorNextDueAt;
    task.lastCompletedAt = shadow.priorLastCompletedAt;
    task.lastCompletedBy = shadow.priorLastCompletedBy;
    householdUndoShadow.delete(taskId);

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
    res.json({ task });
});


// --- BATHROOM ROUTES ---

const DEFAULT_BATHROOM_SCHEDULE = {
    morningStart: '06:00', morningEnd: '10:00',
    eveningStart: '18:00', eveningEnd: '22:00'
};

function getBathroomSchedule() {
    return { ...DEFAULT_BATHROOM_SCHEDULE, ...(appConfig.bathroom?.schedule || {}) };
}

function getBathroomItems() {
    return appConfig.bathroom?.items || [];
}

function bathroomItemIsInWindow(item, window) {
    if (!item) return false;
    if (item.timeSlot === 'both') return window === 'morning' || window === 'evening';
    return item.timeSlot === window;
}

function buildBathroomStateResponse(state, schedule) {
    const window = state.currentWindow;
    const items = window === 'none'
        ? []
        : getBathroomItems().filter(i => bathroomItemIsInWindow(i, window));
    return {
        currentWindow: window,
        schedule,
        items,
        completed: state.completed,
        kids: appConfig.chores?.kids || [],
        nextWindow: nextWindowInfo(schedule)
    };
}

app.get('/api/bathroom/state', (req, res) => {
    const schedule = getBathroomSchedule();
    const active = computeActiveWindow(schedule);
    let state = loadBathroomState();
    const rec = reconcileWindow(state, active);
    if (rec.changed) {
        state = rec.state;
        saveBathroomState(state);
    }
    res.json(buildBathroomStateResponse(state, schedule));
});

app.post('/api/bathroom/toggle', (req, res) => {
    const { itemId, action } = req.body || {};
    if (!itemId || !['complete', 'uncomplete'].includes(action)) {
        return res.status(400).json({ error: 'Invalid body' });
    }

    const schedule = getBathroomSchedule();
    const active = computeActiveWindow(schedule);
    let state = loadBathroomState();
    const rec = reconcileWindow(state, active);
    state = rec.state;
    if (rec.changed) saveBathroomState(state);

    if (active === 'none') {
        return res.status(400).json({ error: 'Outside active window' });
    }

    const item = getBathroomItems().find(i => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!bathroomItemIsInWindow(item, active)) {
        return res.status(400).json({ error: 'Item not in current window' });
    }

    if (action === 'complete') {
        const existing = state.completed[itemId];
        if (existing && existing.window === active) {
            return res.status(409).json({ error: 'Already completed in this window' });
        }

        let linkedChoreCompletionId;
        let linkedChoreWarning = false;
        if (item.linkedChoreId) {
            try {
                const { entry } = grantChoreStars(appConfig, rewardsData, {
                    taskId: item.linkedChoreId,
                    kidId: item.assignedTo,
                    source: 'bathroom'
                });
                linkedChoreCompletionId = entry.id;
            } catch (err) {
                console.warn('[bathroom] linked chore grant failed:', err.message);
                linkedChoreWarning = true;
            }
        }

        const timestamp = Date.now();
        state.completed[itemId] = { timestamp, window: active, linkedChoreCompletionId };
        saveBathroomState(state);
        if (linkedChoreCompletionId) {
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
            saveRewardsData();
        }

        return res.json({
            ...buildBathroomStateResponse(state, schedule),
            completedAt: timestamp,
            linkedChoreWarning
        });
    }

    // uncomplete
    const entry = state.completed[itemId];
    if (!entry || entry.window !== active) {
        return res.status(404).json({ error: 'No active completion to undo' });
    }
    const UNDO_WINDOW_MS = 30_000;
    if (Date.now() - entry.timestamp > UNDO_WINDOW_MS) {
        return res.status(410).json({ error: 'Undo window expired' });
    }
    if (entry.linkedChoreCompletionId) {
        revokeChoreStars(appConfig, rewardsData, entry.linkedChoreCompletionId);
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
        saveRewardsData();
    }
    delete state.completed[itemId];
    saveBathroomState(state);
    return res.json(buildBathroomStateResponse(state, schedule));
});

app.post('/api/bathroom/reset', (req, res) => {
    const { pin } = req.body || {};
    const adminPin = appConfig.adminPin || '1234';
    if (pin !== adminPin) return res.status(401).json({ error: 'Falsche PIN' });

    const schedule = getBathroomSchedule();
    const active = computeActiveWindow(schedule);
    let state = loadBathroomState();
    const kept = {};
    for (const [itemId, entry] of Object.entries(state.completed || {})) {
        if (entry?.window !== active) kept[itemId] = entry;
    }
    state.completed = kept;
    state.currentWindow = active;
    state.windowStartedAt = Date.now();
    saveBathroomState(state);
    res.json(buildBathroomStateResponse(state, schedule));
});


// --- EXECUTE ---
app.listen(PORT, '0.0.0.0', () => { // Bind to 0.0.0.0 for external access
    console.log(`Server running on http://0.0.0.0:${PORT}`);

    // Run Sonos discovery at boot (non-blocking)
    sonos.runDiscovery().catch(err => {
        console.error('Initial Sonos discovery failed:', err.message);
    });
});

