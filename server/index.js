import express from 'express';
import cors from 'cors';
import { Edupage } from 'edupage-api';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

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

let userTokens = null; // In-memory storage for MVP

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
        userTokens = tokens; // Save tokens (consider saving to file/db in prod)
        console.log("Google tokens acquired successfully.");
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
    if (!calendarIds || !Array.isArray(calendarIds)) {
        return res.status(400).json({ error: "Missing calendarIds array" });
    }

    try {
        oauth2Client.setCredentials(userTokens);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const allEvents = [];
        const timeMin = new Date().toISOString();
        const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // Next 7 days

        for (const calId of calendarIds) {
            const response = await calendar.events.list({
                calendarId: calId,
                timeMin: timeMin,
                timeMax: timeMax,
                singleEvents: true,
                orderBy: 'startTime',
            });
            // Tag events with calendar ID/Name if needed
            const events = response.data.items.map(e => ({
                ...e,
                calendarId: calId // Track source
            }));
            allEvents.push(...events);
        }

        // Sort combined events by date
        allEvents.sort((a, b) => {
            const dateA = new Date(a.start.dateTime || a.start.date);
            const dateB = new Date(b.start.dateTime || b.start.date);
            return dateA - dateB;
        });

        res.json(allEvents);
        console.log(`DEBUG: Found ${allEvents.length} events total.`);
    } catch (error) {
        console.error("Error fetching events", error);
        res.status(500).json({ error: "Failed to fetch events" });
    }
});

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
