import { Edupage } from 'edupage-api';
import dotenv from 'dotenv';
dotenv.config();

const user = process.env.EDUPAGE_USER;
const pass = process.env.EDUPAGE_PASSWORD;

if (!user || !pass) {
    console.error("Missing credentials in .env");
    process.exit(1);
}

const run = async () => {
    try {
        const edupage = new Edupage();
        await edupage.login(user, pass);
        console.log("Logged in successfully.");

        // Check for students property
        console.log("edupage.students:", edupage.students);
        console.log("edupage.user.students:", edupage.user?.students);

        // Try to verify if there are multiple "users" or "children" attached
        // Sometimes edupage has a list of children
        // The API documentation or source might reveal 'getStudents' or similar?
        // Let's dump the edupage object limitation 
        // keys
        console.log("Keys on edupage instance:", Object.keys(edupage));

        // IF there is a way to switch student, we need to know.
        // Assuming edupage-api might have a 'switchStudent' or loop?
        // Or maybe 'getTimetableForDate' takes a studentId?

    } catch (e) {
        console.error("Error:", e);
    }
};

run();
