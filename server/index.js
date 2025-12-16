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

        // Prepare response array
        const studentsData = [];

        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Fetch Timetable using verified method
        const rawTimetable = await edupage.getTimetableForDate(today);

        // Sanitize data to avoid Circular Structure error
        const timetable = rawTimetable.map(lesson => ({
            id: lesson.id,
            startTime: lesson.startTime,
            endTime: lesson.endTime,
            date: lesson.date,
            subject: lesson.subject ? { name: lesson.subject.name, short: lesson.subject.short } : { name: '?', short: '?' },
            classroom: lesson.classroom ? { name: lesson.classroom.name } : { name: '' },
            teacher: lesson.teacher ? { name: lesson.teacher.name } : { name: '' },
            class: lesson.class ? { name: lesson.class.name } : { name: '' }
        }));

        studentsData.push({
            name: edupage.user.firstName || edupage.user.name || "Schüler",
            timetable: timetable,
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
