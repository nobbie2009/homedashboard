import express from 'express';
import cors from 'cors';
import { Edupage } from 'edupage-api';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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

        // Confirm student data sources
        console.log("Edupage User Props:", Object.keys(edupage.user || {}));
        console.log("Edupage Instance Props:", Object.keys(edupage));
        // console.log("Edupage Students List:", edupage.students);

        const studentsData = [];

        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

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

        // Get student IDs (gpids)
        // Accessing internal ASC object if available, or fallback to single user
        const gpids = edupage.ASC?.gpids || [];
        if (gpids.length === 0 && edupage.user) {
            // Fallback if no gpids found (unlikely if login worked)
            studentsData.push({
                name: edupage.user.firstName || edupage.user.name || "Schüler",
                timetable: [],
                homework: []
            });
        }

        console.log("Found GPIDs (ASC):", gpids);

        // Fallback: If no GPIDs in ASC, check if we have students in edupage.students
        // and try to use their IDs.
        const studentObjects = edupage.students || [];
        const safeStudentObjects = studentObjects.map(s => {
            // Safe extraction of properties
            return {
                id: s.id,
                studentId: s.studentId, // Try potential ID fields
                name: s.name,
                firstName: s.firstName,
                surname: s.surname
            };
        });
        console.log("Student Objects dump:", JSON.stringify(safeStudentObjects, null, 2));

        let effectiveGpids = [...gpids];
        if (effectiveGpids.length === 0 && studentObjects.length > 0) {
            console.log("Attempting to use student IDs as GPIDs...");
            effectiveGpids = studentObjects.map(s => s.id);
        }

        // If still empty, create a dummy entry to force at least one pass (for default user)
        if (effectiveGpids.length === 0) {
            console.log("No IDs found, defaulting to single user pass.");
            effectiveGpids = [null];
        }

        console.log("Effective GPIDs to process:", effectiveGpids);

        for (let i = 0; i < effectiveGpids.length; i++) {
            const gpid = effectiveGpids[i];

            // Switch Context if we have a real gpid
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
            let name = `Schüler ${i + 1}`;
            if (studentObjects[i] && (studentObjects[i].name || studentObjects[i].firstName)) {
                name = studentObjects[i].firstName || studentObjects[i].name;
            } else if (i === 0 && edupage.user) {
                name = edupage.user.firstName || edupage.user.name || name;
            }

            studentsData.push({
                name: name,
                timetable: timetable,
                homework: []
            });
        }

        // If for some reason loop didn't run (no gpids?), fallback handled above or empty.

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
