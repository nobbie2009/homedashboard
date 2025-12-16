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

        // Check for linked students (Note: API structure assumptions)
        // If edupage.students exists, we iterate. Otherwise we use the main user.
        // We log the structure to help debugging if it differs.
        console.log("Edupage User:", edupage.user);
        // console.log("Edupage Students:", edupage.students);

        // Fetch Timetable for 'Today' and 'Tomorrow'
        // We implement a helper to fetch data for a specific "context" if possible
        // Currently assuming 'getTimetable' works for the active context.

        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Fetch basic timetable
        const timetable = await edupage.getTimetable();

        // Fetch homework/exams if available
        // const homework = await edupage.getHomework(); // Function name guess, check docs?
        // 'getTests', 'getNotes'? 
        // We start with Timetable which is standard.

        // If we can identify students, push them.
        // For now, wrap the single result in an array to support the frontend structure.
        // If edupage-api supports multiple students, we would iterate here.
        // But since we can't test, we deliver the main one.

        studentsData.push({
            name: edupage.user.firstName || edupage.user.name || "Schüler",
            timetable: timetable,
            homework: [] // Placeholder
        });

        // Debug: access other students?
        // if (edupage.students) { ... }

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
