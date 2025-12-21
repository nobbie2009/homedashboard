import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { Client } from '@notionhq/client';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { security } from './security.js';

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
    res.json({ ip: results[0] || 'localhost' });
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

let userTokens = null;
let appConfig = {};

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

// --- Config Endpoints ---
app.get('/api/config', (req, res) => {
    res.json(appConfig);
});

app.post('/api/config', (req, res) => {
    try {
        const newConfig = { ...appConfig, ...req.body };
        appConfig = newConfig;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
        console.log("Config saved.");
        res.json({ success: true, config: appConfig });
    } catch (err) {
        console.error("Failed to save config:", err);
        res.status(500).json({ error: "Failed to save config" });
    }
});

// Backup & Restore
app.get('/api/config/backup', (req, res) => {
    if (fs.existsSync(CONFIG_PATH)) {
        res.download(CONFIG_PATH, 'homedashboard-config.json');
    } else {
        res.json(appConfig); // If no file yet, send in-memory
    }
});

app.post('/api/config/restore', (req, res) => {
    try {
        const newConfig = req.body;
        // Basic validation
        if (typeof newConfig !== 'object') {
            return res.status(400).send("Invalid config format");
        }
        appConfig = newConfig;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(appConfig, null, 2));
        console.log("Config restored from backup.");
        res.json({ success: true });
    } catch (err) {
        console.error("Restore failed:", err);
        res.status(500).send("Restore failed");
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
        scope: scopes
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
        userTokens = tokens;

        // Save tokens to file
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
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
            }
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
            const targetDate = props.Ziel?.date?.start || createdTime;

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

import { spawn } from 'child_process';

app.get('/api/camera/stream', (req, res) => {
    const streamUrl = appConfig.cameraUrl;

    if (!streamUrl) {
        return res.status(404).send("Camera URL not configured");
    }

    console.log("Starting Stream for:", streamUrl);

    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=ffmpeg',
        'Cache-Control': 'no-cache',
        'Connection': 'close',
        'Pragma': 'no-cache'
    });

    const ffmpeg = spawn('ffmpeg', [
        '-probesize', '64000',
        '-analyzeduration', '0',
        '-rtsp_transport', 'tcp',
        '-i', streamUrl,
        '-vf', 'scale=800:-1', // Downscale to 800px width (maintains aspect ratio)
        '-f', 'mjpeg',
        '-q:v', '8', // Balanced quality (lower number = higher quality, 1-31)
        '-r', '10', // Reduced to 10fps to save more bandwidth
        '-'
    ]);

    ffmpeg.stdout.pipe(res, { end: false });

    // Handle errors
    ffmpeg.stderr.on('data', (data) => {
        console.error(`FFMPEG Error: ${data}`); // Verbose
    });

    // Cleanup on client disconnect
    req.on('close', () => {
        console.log("Client disconnected, killing ffmpeg");
        ffmpeg.kill();
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

// --- Edupage Proxy ---
app.get('/api/edupage', (req, res) => {
    const username = req.headers['username'];
    const password = req.headers['password'];
    // Default to "login1" if not provided header (though bridge script also defaults)
    const subdomain = req.headers['subdomain'] || 'login1';

    // Validate credentials presence
    if (!username || !password) {
        return res.status(400).send("Missing credentials");
    }

    const scriptPath = path.join(__dirname, 'edupage_bridge_v2.py');
    console.log(`DEBUG: Executing Python script at: ${scriptPath} with subdomain: ${subdomain}`);

    // Execute python script
    execFile('python', [scriptPath, username, password, subdomain], (error, stdout, stderr) => {
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
            res.json(data);
        } else {
            res.status(500).send("No data returned from Edupage script");
        }
    });
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

