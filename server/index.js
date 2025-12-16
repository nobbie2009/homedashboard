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

        // Get basic data for "today" and "tomorrow"
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const timetable = await edupage.getTimetable();

        res.json({
            user: edupage.user,
            timetable
        });

    } catch (error) {
        console.error("Edupage Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
