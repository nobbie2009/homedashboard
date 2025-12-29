/**
 * Checks if tasks need to be rotated and performs the rotation.
 * Returns the updated configuration part for chores, or null if no change needed.
 */
export const checkAndRotateChores = (config) => {
    if (!config.chores) return null;

    const { tasks, kids, settings } = config.chores;
    if (!kids || kids.length < 2) return null; // Need at least 2 kids to rotate

    const now = new Date();
    const lastRotDate = new Date(settings.lastRotation || 0);

    let updated = false;
    let newTasks = [...tasks];
    let newSettings = { ...settings };

    // ROTATE WEEKLY TASKS
    const currentWeek = getWeekNumber(now);
    const lastWeek = getWeekNumber(lastRotDate);

    // If week changed (and last rotation was not this week)
    if (currentWeek !== lastWeek || (now.getFullYear() > lastRotDate.getFullYear() && currentWeek < 52)) {
        console.log(`[ChoreLogic] Rotating Weekly Tasks. Week ${lastWeek} -> ${currentWeek}`);
        const weeklyTasks = newTasks.filter(t => t.rotation === 'weekly');
        if (weeklyTasks.length > 0) {
            weeklyTasks.forEach(task => {
                rotateTask(task, kids);
            });
            updated = true;
        }

        // Update timestamp to now
        newSettings.lastRotation = now.getTime();
    }

    // ROTATE DAILY TASKS
    const lastDaily = settings.lastDailyRotation ? new Date(settings.lastDailyRotation) : new Date(0);
    if (!isSameDay(now, lastDaily)) {
        console.log(`[ChoreLogic] Rotating Daily Tasks. Last: ${lastDaily.toDateString()} -> Now: ${now.toDateString()}`);
        const dailyTasks = newTasks.filter(t => t.rotation === 'daily');
        if (dailyTasks.length > 0) {
            dailyTasks.forEach(task => {
                rotateTask(task, kids);
            });
            updated = true;
        }
        newSettings.lastDailyRotation = now.getTime();
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

const getWeekNumber = (d) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
};

const isSameDay = (d1, d2) => {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
};
