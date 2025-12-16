const express = require('express');
const cors = require('cors');
const { Edupage } = require('edupage-api');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3001; // Backend Port

// Cache connection to reuse session?
// Edupage logic usually requires login per request or session persistence.
// For simplicity, we login on request for now, or maintain a singleton if efficient.

app.get('/api/edupage', async (req, res) => {
    const { username, password } = req.headers; // Or use env vars if hardcoded

    // Prefer Env vars for dashboard usage
    const user = process.env.EDUPAGE_USER || username;
    const pass = process.env.EDUPAGE_PASSWORD || password;

    if (!user || !pass) {
        return res.status(401).json({ error: 'Missing credentials' });
    }

    try {
        const edupage = new Edupage();
        await edupage.login(user, pass);

        // Get children/students?
        // edupage-api might default to the main user or provide a way to switch.
        // Assuming the parent account sees everything or we need to iterate.
        // Documentation says we can get valid students/timelines.

        // Get basic data for "today" and "tomorrow"
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Mocking structure for now until we verify API response structure
        // In a real implementation we would inspect `edupage.user` or fetch `edupage.getTimetable()`.

        // Example: Get timetable
        const timetable = await edupage.getTimetable();

        // Return raw data for now to inspect in frontend
        res.json({
            user: edupage.user,
            timetable
        });

        // Note: Real implementation needs careful mapping of 2 children.
        // We might need to select specific students if the API allows.

    } catch (error) {
        console.error("Edupage Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
