import { AppConfig, Chore, Kid } from '../contexts/ConfigContext';

/**
 * Checks if tasks need to be rotated and performs the rotation.
 * Returns the updated configuration part for chores, or null if no change needed.
 */
export const checkAndRotateChores = (config: AppConfig): { tasks: Chore[], settings: any } | null => {
    if (!config.chores) return null;

    const { tasks, kids, settings } = config.chores;
    if (!kids || kids.length < 2) return null; // Need at least 2 kids to rotate

    const now = new Date();
    // const lastRotation = settings.lastRotation || 0;

    // We will track rotation by specific last run timestamps in settings for robustness
    // assuming settings can hold 'lastDailyRotation' and 'lastWeeklyRotation'
    // If not present, we assume standard 'lastRotation' is for weekly?
    // Let's check the types. The user defined RotationSettings with `lastRotation`.
    // We'll stick to that for now as the "Weekly" anchor, or try to be smarter.

    // Strategy:
    // 1. Get current Week Number and Day of Year
    // 2. We simply rotate if the stored "lastRotation" date is in a previous period.
    // BUT we have mixed intervals (daily, weekly).

    // Let's modify tasks directly. We need to store 'lastRotated' on the task ideally, 
    // but we can't easily change the schema without breaking existing config if we are strict.
    // However, we can use the Global `lastRotation` for the main weekly "sync".
    // For now, let's implement a simple Weekly rotation that triggers on Monday.

    const lastRotDate = new Date(settings.lastRotation || 0);

    // Check if new week (Simple check: is it Monday and last rotation was before today?)
    // Or just: Has it been > 7 days? Better: Is it a different ISO Week?

    // Let's do a simple approach requested by the user: "Interval".
    // If we want "Weekly" rotation, we rotate once a week.
    // Let's try to rotate on Sunday Midnight.


    let updated = false;
    let newTasks = [...tasks];
    let newSettings = { ...settings };

    // ROTATE WEEKLY TASKS
    // Logic: If it's a new week (e.g. Monday) and we haven't rotated this week.
    // Simpler: If diffDays > 7? No, that drifts.
    // Correct way: Check ISO week.

    const currentWeek = getWeekNumber(now);
    const lastWeek = getWeekNumber(lastRotDate);

    // If week changed (and last rotation was not this week)
    if (currentWeek !== lastWeek || (now.getFullYear() > lastRotDate.getFullYear() && currentWeek < 52)) {
        // Rotate all 'weekly' tasks
        // Optimization: Ensure we don't rotate multiple times if script runs often. 
        // We update lastRotation timestamp.

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
    // We need a separate timestamp for daily... 
    // Since we don't have it in the interface `RotationSettings` defined earlier explicitly (it just had lastRotation),
    // we might abuse `lastRotation` or we just rely on the fact we can add props loosely in JS/JSON.
    // Let's check if we can add `lastDailyRotation`.

    const lastDaily = (settings as any).lastDailyRotation ? new Date((settings as any).lastDailyRotation) : new Date(0);
    if (!isSameDay(now, lastDaily)) {
        // It's a new day!
        const dailyTasks = newTasks.filter(t => t.rotation === 'daily');
        if (dailyTasks.length > 0) {
            dailyTasks.forEach(task => {
                rotateTask(task, kids);
            });
            updated = true;
        }
        (newSettings as any).lastDailyRotation = now.getTime();
    }

    if (updated) {
        return { tasks: newTasks, settings: newSettings };
    }

    return null;
};

// Helper to rotate a single task to the next kid
const rotateTask = (task: Chore, kids: Kid[]) => {
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

const getWeekNumber = (d: Date) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
};

const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
};
