import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@notionhq/client';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

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

app.get('/api/edupage', async (req, res) => {
    const { username, password } = req.headers;

    const user = process.env.EDUPAGE_USER || username;
    const pass = process.env.EDUPAGE_PASSWORD || password;

    if (!user || !pass) {
        return res.status(401).json({ error: 'Missing credentials' });
    }

    try {
        const edupage = new Edupage();
        await edupage.login(user, pass);

        const studentsData = [];
        const today = new Date();

        // Function to sanitize lessons
        const mapLessons = (raw) => {
            if (!raw) return [];
            let list = Array.isArray(raw) ? raw : (raw.lessons || []);
            return list.map(lesson => ({
                id: lesson.id,
                startTime: lesson.startTime,
                endTime: lesson.endTime,
                date: lesson.date,
                subject: lesson.subject ? { name: lesson.subject.name, short: lesson.subject.short } : { name: '?', short: '?' },
                classroom: lesson.classroom ? { name: lesson.classroom.name } : { name: '' },
                teacher: lesson.teacher ? { name: lesson.teacher.name } : { name: '' },
                class: lesson.class ? { name: lesson.class.name } : { name: '' }
            }));
        };

        // Initialize gpids by fetching today's timetable for default student
        try {
            await edupage.getTimetableForDate(today);
        } catch (e) {
            console.log("Initial fetch failed, maybe login issue or no rights", e);
        }

        const gpids = edupage.ASC?.gpids || [];
        console.log("Found GPIDs (ASC):", gpids);

        // Helper to fetch days
        const fetchDays = async () => {
            const daysToFetch = 3; // Today + 2 days
            const lessons = [];
            for (let i = 0; i < daysToFetch; i++) {
                const d = new Date(today);
                d.setDate(today.getDate() + i);
                try {
                    const raw = await edupage.getTimetableForDate(d);
                    lessons.push(...mapLessons(raw));
                } catch (err) {
                    console.error(`Failed to fetch date ${d}:`, err);
                }
            }
            return lessons;
        };

        // Student lists
        const studentObjects = edupage.students || [];

        // --- FILTERING LOGIC ---
        // Filter for specific children IDs provided by user: -255 and -179
        const targetIds = ['-255', '-179'];
        console.log(`Filtering for student IDs: ${targetIds.join(", ")}`);

        const matchedStudents = studentObjects.filter(s => targetIds.includes(s.id));
        console.log(`Found ${matchedStudents.length} matching students.`);

        let effectiveGpids = [];
        if (matchedStudents.length > 0) {
            effectiveGpids = matchedStudents.map(s => s.id);
        } else {
            console.warn("No matching students found by ID! Falling back to raw GPIDs (limited).");
            effectiveGpids = [...gpids];
            // If still empty and User exists, maybe fallback to single pass? 
            if (effectiveGpids.length === 0 && edupage.user) {
                effectiveGpids = [null]; // Force one pass for default user
            }

            // Limit to avoids massive fetching if we missed the specific IDs
            const maxStudents = 5;
            if (effectiveGpids.length > maxStudents) {
                effectiveGpids = effectiveGpids.slice(0, maxStudents);
            }
        }

        console.log("Final GPIDs to process:", effectiveGpids);

        for (let i = 0; i < effectiveGpids.length; i++) {
            const gpid = effectiveGpids[i];
            console.log(`Processing GPID [${i}]: ${gpid}`);

            // Switch Context if we have a real gpid and ASC object exists
            if (gpid && edupage.ASC) {
                edupage.ASC.gpid = gpid;
            }

            // CRITICAL: Clear cache to force fetch for new student
            edupage.timetables = [];

            let timetable = [];
            try {
                timetable = await fetchDays();
                console.log(`Fetched ${timetable.length} lessons for GPID ${gpid}`);
            } catch (err) {
                console.error(`Error fetching for GPID ${gpid}:`, err);
            }

            // Name resolution
            // Try to find the student object that matches this GPID
            const studentObj = studentObjects.find(s => s.id === gpid);
            let name = `Schüler ${gpid || (i + 1)}`;

            if (studentObj) {
                // FIXED: Check lowercase 'firstname' as well
                name = studentObj.firstname || studentObj.firstName || studentObj.name || studentObj.lastname || name;
            } else if (i === 0 && edupage.user) {
                // Fallback to user name if only one student or default
                name = edupage.user.firstname || edupage.user.firstName || edupage.user.name || name;
            }

            // Fetch Timeline (Homework + Messages)
            let homework = [];
            let inbox = [];
            try {
                await edupage.refreshTimeline();

                // Process Homework
                if (edupage.homeworks) {
                    if (edupage.homeworks.length > 0) {
                        try {
                            const sample = edupage.homeworks[0];
                            // Avoid circular reference by logging shallow clone with limited depth or just keys
                            console.log("DEBUG HOMEWORK ITEM [0] KEYS:", Object.keys(sample));
                            console.log("DEBUG HOMEWORK ITEM [0] DATA:", {
                                id: sample.id,
                                title: sample.title,
                                studentID: sample.studentID,
                                student: sample.student,
                                owner: sample.owner
                            });
                        } catch (e) { console.log("Log error:", e); }
                    }
                    homework = edupage.homeworks.map(hw => ({
                        id: hw.id,
                        title: hw.title || "Hausaufgabe",
                        subject: hw.subject ? hw.subject.name : "Unbekannt",
                        date: hw.date || hw.dueDate || hw.completionDate, // Try common date fields
                        done: hw.done || false
                    }));
                }

                // Process Inbox (Messages)
                if (edupage.timeline) {
                    // Filter simply for now, maybe all timeline items are interesting?
                    // The user specifically asked for "Posteingang" (Inbox).
                    // Usually type 'message' is what we want.
                    inbox = edupage.timeline
                        .filter(item => item.type === 'message' || item.type === 'notice')
                        .map(msg => ({
                            id: msg.id,
                            title: msg.title || msg.subject || "Nachricht",
                            body: msg.body || msg.text || "",
                            sender: msg.sender ? msg.sender.name : "Unbekannt",
                            date: msg.date,
                            limitDate: msg.limitDate
                        }));
                }
                console.log(`Fetched ${homework.length} homeworks and ${inbox.length} messages for GPID ${gpid}`);

            } catch (err) {
                console.error(`Error fetching timeline for GPID ${gpid}:`, err);
            }

            studentsData.push({
                name: name,
                timetable: timetable,
                homework: homework,
                inbox: inbox
            });
        }

        res.json({
            students: studentsData
        });

    } catch (error) {
        console.error("Edupage Error:", error);
        res.status(500).json({ error: error.message || "Unknown Error" });
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

            const createdTime = page.created_time || new Date().toISOString();

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
                author: "Notion",
                createdAt: createdTime,
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
