// Run with: node server/test/bathroom.test.js
// Exercises grantChoreStars/revokeChoreStars and window reconciliation
// in isolation. No server, no disk writes.
import assert from 'node:assert/strict';
import { grantChoreStars, revokeChoreStars } from '../choreLogic.js';
import { computeActiveWindow, reconcileWindow, nextWindowInfo } from '../bathroomState.js';

function makeConfig() {
    return {
        chores: {
            tasks: [{ id: 't1', label: 'Test', difficulty: 2 }],
            kids: [{ id: 'k1', name: 'Kind' }]
        },
        rewards: {
            mode: 'individual', targetStars: 20, currentReward: '',
            kidStars: {}, sharedStars: 0
        }
    };
}

// grantChoreStars adds correct stars in individual mode
{
    const cfg = makeConfig();
    const rd = { completions: [] };
    const { entry, rewards } = grantChoreStars(cfg, rd, { taskId: 't1', kidId: 'k1', source: 'bathroom' });
    assert.equal(entry.stars, 2);
    assert.equal(entry.source, 'bathroom');
    assert.equal(entry.mode, 'individual');
    assert.equal(rewards.kidStars.k1, 2);
    assert.equal(rd.completions.length, 1);
    console.log('OK  grantChoreStars individual');
}

// grantChoreStars adds to sharedStars in shared mode
{
    const cfg = makeConfig();
    cfg.rewards.mode = 'shared';
    const rd = { completions: [] };
    grantChoreStars(cfg, rd, { taskId: 't1', kidId: 'k1' });
    assert.equal(cfg.rewards.sharedStars, 2);
    console.log('OK  grantChoreStars shared');
}

// grantChoreStars throws on unknown task
{
    const cfg = makeConfig();
    const rd = { completions: [] };
    assert.throws(() => grantChoreStars(cfg, rd, { taskId: 'nope', kidId: 'k1' }));
    console.log('OK  grantChoreStars throws on unknown task');
}

// revokeChoreStars rolls back correctly
{
    const cfg = makeConfig();
    const rd = { completions: [] };
    const { entry } = grantChoreStars(cfg, rd, { taskId: 't1', kidId: 'k1' });
    revokeChoreStars(cfg, rd, entry.id);
    assert.equal(cfg.rewards.kidStars.k1, 0);
    assert.equal(rd.completions.length, 0);
    console.log('OK  revokeChoreStars individual');
}

// revokeChoreStars respects entry's mode even if config flipped
{
    const cfg = makeConfig();
    const rd = { completions: [] };
    const { entry } = grantChoreStars(cfg, rd, { taskId: 't1', kidId: 'k1' });
    cfg.rewards.mode = 'shared';
    cfg.rewards.sharedStars = 100;
    revokeChoreStars(cfg, rd, entry.id);
    assert.equal(cfg.rewards.kidStars.k1, 0);
    assert.equal(cfg.rewards.sharedStars, 100);
    console.log('OK  revokeChoreStars uses entry mode not current mode');
}

// revokeChoreStars silent no-op on unknown id
{
    const cfg = makeConfig();
    const rd = { completions: [] };
    revokeChoreStars(cfg, rd, 'doesnotexist');
    console.log('OK  revokeChoreStars no-op on unknown id');
}

// computeActiveWindow returns correct window
{
    const schedule = { morningStart: '06:00', morningEnd: '10:00', eveningStart: '18:00', eveningEnd: '22:00' };
    const at = (h, m) => new Date(2026, 0, 1, h, m);
    assert.equal(computeActiveWindow(schedule, at(7, 0)), 'morning');
    assert.equal(computeActiveWindow(schedule, at(10, 0)), 'none'); // exclusive end
    assert.equal(computeActiveWindow(schedule, at(19, 30)), 'evening');
    assert.equal(computeActiveWindow(schedule, at(12, 0)), 'none');
    assert.equal(computeActiveWindow(schedule, at(5, 59)), 'none');
    assert.equal(computeActiveWindow(schedule, at(6, 0)), 'morning'); // inclusive start
    console.log('OK  computeActiveWindow');
}

// reconcileWindow clears stale entries
{
    const state = {
        currentWindow: 'morning',
        windowStartedAt: 0,
        completed: {
            'a': { timestamp: 1, window: 'morning' },
            'b': { timestamp: 2, window: 'evening' }
        }
    };
    const { state: next, changed } = reconcileWindow(state, 'evening');
    assert.equal(changed, true);
    assert.equal(next.currentWindow, 'evening');
    assert.deepEqual(Object.keys(next.completed), ['b']);
    console.log('OK  reconcileWindow clears stale entries');
}

// reconcileWindow is no-op when window unchanged
{
    const state = { currentWindow: 'morning', windowStartedAt: 123, completed: { a: { window: 'morning' } } };
    const { state: next, changed } = reconcileWindow(state, 'morning');
    assert.equal(changed, false);
    assert.equal(next, state);
    console.log('OK  reconcileWindow no-op');
}

// nextWindowInfo picks chronologically-next start
{
    const schedule = { morningStart: '06:00', morningEnd: '10:00', eveningStart: '18:00', eveningEnd: '22:00' };
    const at = (h, m) => new Date(2026, 0, 1, h, m);
    assert.equal(nextWindowInfo(schedule, at(5, 0)).name, 'morning');
    assert.equal(nextWindowInfo(schedule, at(12, 0)).name, 'evening');
    assert.equal(nextWindowInfo(schedule, at(23, 0)).name, 'morning'); // wraps to next day
    console.log('OK  nextWindowInfo');
}

console.log('\nAll bathroom tests passed.');
