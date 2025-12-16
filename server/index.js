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

        const rawToday = await edupage.getTimetableForDate(today);
        const rawTomorrow = await edupage.getTimetableForDate(tomorrow);

        const timetableToday = mapLessons(rawToday);
        const timetableTomorrow = mapLessons(rawTomorrow);

        // Combine for now (or distinct properties?)
        // Frontend expects 'timetable' array. We can merge or change frontend to expect { today, tomorrow }.
        // Let's merge and let frontend sort/filter by date?
        // Or better: update frontend to receive separated lists.
        // For compatibility with current Frontend check:
        // Frontend uses: student.timetable.filter(isToday) logic? No, current frontend assumes all is today.
        // I will change the backend to return 'timetable' containing both, and let Frontend filter.

        studentsData.push({
            name: edupage.user.firstName || edupage.user.name || "Schüler",
            timetable: [...timetableToday, ...timetableTomorrow],
            homework: []
        });

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
