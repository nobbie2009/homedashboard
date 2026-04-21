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

/**
 * Grants stars for a completed chore. Pure function operating on passed-in
 * state objects (appConfig, rewardsData). Mutates both. Throws on invalid
 * task/kid. Caller is responsible for persisting appConfig/rewardsData.
 *
 * Used by both the legacy /api/rewards/complete route (after PIN check)
 * and the bathroom endpoints (no PIN, server-enforced once-per-window).
 */
export function grantChoreStars(appConfig, rewardsData, { taskId, kidId, source }) {
    const task = appConfig.chores?.tasks?.find(t => t.id === taskId);
    const kid = appConfig.chores?.kids?.find(k => k.id === kidId);
    if (!task) throw new Error(`Task not found: ${taskId}`);
    if (!kid) throw new Error(`Kid not found: ${kidId}`);

    const stars = task.difficulty || 1;
    const mode = appConfig.rewards?.mode || 'individual';

    const entry = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        taskId: task.id,
        taskLabel: task.label,
        kidId: kid.id,
        kidName: kid.name,
        stars,
        timestamp: Date.now(),
        source: source || 'chore',
        mode
    };
    rewardsData.completions.push(entry);

    if (!appConfig.rewards) {
        appConfig.rewards = { mode: 'individual', targetStars: 20, currentReward: '', kidStars: {}, sharedStars: 0 };
    }

    if (mode === 'shared') {
        appConfig.rewards.sharedStars = (appConfig.rewards.sharedStars || 0) + stars;
    } else {
        if (!appConfig.rewards.kidStars) appConfig.rewards.kidStars = {};
        appConfig.rewards.kidStars[kid.id] = (appConfig.rewards.kidStars[kid.id] || 0) + stars;
    }

    return { entry, rewards: appConfig.rewards };
}

/**
 * Reverses a grant. Uses the entry's persisted `mode` (not current config
 * mode) so rollbacks are correct even if the admin switches modes in
 * between. Silent no-op if entry not found. Floor decrement at 0.
 */
export function revokeChoreStars(appConfig, rewardsData, completionId) {
    const idx = rewardsData.completions.findIndex(e => e.id === completionId);
    if (idx === -1) return { rewards: appConfig.rewards };

    const entry = rewardsData.completions[idx];
    const stars = entry.stars || 0;
    const mode = entry.mode || 'individual';

    if (!appConfig.rewards) {
        appConfig.rewards = { mode: 'individual', targetStars: 20, currentReward: '', kidStars: {}, sharedStars: 0 };
    }

    if (mode === 'shared') {
        appConfig.rewards.sharedStars = Math.max(0, (appConfig.rewards.sharedStars || 0) - stars);
    } else {
        if (!appConfig.rewards.kidStars) appConfig.rewards.kidStars = {};
        appConfig.rewards.kidStars[entry.kidId] = Math.max(0, (appConfig.rewards.kidStars[entry.kidId] || 0) - stars);
    }

    rewardsData.completions.splice(idx, 1);
    return { rewards: appConfig.rewards };
}

