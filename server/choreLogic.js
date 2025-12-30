/**
 * Checks if tasks need to be rotated and performs the rotation.
 * Uses ABSOLUTE dates (nextWeeklyRotation, nextDailyRotation) to prevent
 * unwanted rotations on server restart.
 * Returns the updated configuration part for chores, or null if no change needed.
 */
export const checkAndRotateChores = (config) => {
    if (!config.chores) return null;

    const { tasks, kids, settings } = config.chores;
    if (!kids || kids.length < 2) return null; // Need at least 2 kids to rotate
    if (!tasks || tasks.length === 0) return null;

    const now = new Date();
    const nowMs = now.getTime();

    let updated = false;
    let newTasks = [...tasks];
    let newSettings = { ...settings };

    // ROTATE WEEKLY TASKS - using absolute next rotation date
    const nextWeekly = settings.nextWeeklyRotation;
    const weeklyTasks = newTasks.filter(t => t.rotation === 'weekly');

    if (weeklyTasks.length > 0) {
        // Check if we've passed the next weekly rotation time
        if (!nextWeekly || nowMs >= nextWeekly) {
            console.log(`[ChoreLogic] Rotating Weekly Tasks. Next rotation was: ${nextWeekly ? new Date(nextWeekly).toISOString() : 'not set'}`);

            weeklyTasks.forEach(task => {
                rotateTask(task, kids);
            });
            updated = true;

            // Calculate next Monday at 00:00
            const nextMonday = getNextMonday(now);
            newSettings.nextWeeklyRotation = nextMonday.getTime();
            console.log(`[ChoreLogic] Next weekly rotation: ${nextMonday.toISOString()}`);
        }
    }

    // ROTATE DAILY TASKS - using absolute next rotation date
    const nextDaily = settings.nextDailyRotation;
    const dailyTasks = newTasks.filter(t => t.rotation === 'daily');

    if (dailyTasks.length > 0) {
        // Check if we've passed the next daily rotation time
        if (!nextDaily || nowMs >= nextDaily) {
            console.log(`[ChoreLogic] Rotating Daily Tasks. Next rotation was: ${nextDaily ? new Date(nextDaily).toISOString() : 'not set'}`);

            dailyTasks.forEach(task => {
                rotateTask(task, kids);
            });
            updated = true;

            // Calculate tomorrow at 00:00
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            newSettings.nextDailyRotation = tomorrow.getTime();
            console.log(`[ChoreLogic] Next daily rotation: ${tomorrow.toISOString()}`);
        }
    }

    if (updated) {
        return { tasks: newTasks, settings: newSettings };
    }

    return null;
};


// Helper to rotate a single task to the next kid
const rotateTask = (task, kids) => {
    if (!task.assignedTo) return;

    const currentKidIndex = kids.findIndex(k => k.id === task.assignedTo);
    if (currentKidIndex === -1) {
        // Assign to first kid if current is invalid
        task.assignedTo = kids[0].id;
    } else {
        // Move to next kid
        const nextIndex = (currentKidIndex + 1) % kids.length;
        task.assignedTo = kids[nextIndex].id;
    }
};

// Calculate next Monday at 00:00:00
const getNextMonday = (fromDate) => {
    const date = new Date(fromDate);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, ...

    // Calculate days until next Monday
    // If today is Monday (1), we want 7 days (next week's Monday)
    // If today is Sunday (0), we want 1 day
    // If today is Tuesday (2), we want 6 days
    const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);

    const nextMonday = new Date(date);
    nextMonday.setDate(date.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);

    return nextMonday;
};

