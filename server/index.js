import express from 'express';
import cors from 'cors';
import { Edupage } from 'edupage-api';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001;

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
                name = studentObj.firstName || studentObj.name || studentObj.lastname || name;
            } else if (i === 0 && edupage.user) {
                // Fallback to user name if only one student or default
                name = edupage.user.firstName || edupage.user.name || name;
            }

            studentsData.push({
                name: name,
                timetable: timetable,
                homework: []
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

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
