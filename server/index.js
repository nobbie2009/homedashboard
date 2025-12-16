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

        console.log("Found GPIDs:", gpids);

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

        // Iterate students
        // Attempts to find names in edupage.students or edupage.user.students if available
        // We really don't have a reliable Map of ID -> Name without more probing, 
        // so we might use "Student 1", "Student 2" or try to find name in fetched data?
        // Actually, edupage.students might be the array of Student objects matching gpids?
        const studentObjects = edupage.students || [];

        for (let i = 0; i < gpids.length; i++) {
            const gpid = gpids[i];

            // Switch Context
            if (edupage.ASC) {
                edupage.ASC.gpid = gpid;
            }

            // CRITICAL: Clear cache to force fetch for new student
            edupage.timetables = [];

            const timetable = await fetchDays();

            // Name resolution
            let name = `Schüler ${i + 1}`;
            // Try to find name in studentObjects
            // Assuming studentObjects might have 'id' or 'gpid' matching?
            // Or maybe just index matching?
            if (studentObjects[i] && (studentObjects[i].name || studentObjects[i].firstName)) {
                name = studentObjects[i].firstName || studentObjects[i].name;
            } else if (i === 0 && edupage.user) {
                // Default to user name for first one if no students array
                name = edupage.user.firstName || edupage.user.name || name;
            }

            studentsData.push({
                name: name,
                timetable: timetable,
                homework: [] // Homework fetching usually also needs gpid switch
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
