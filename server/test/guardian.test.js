import assert from 'node:assert/strict';
import { parseLevel, levelOf, describe, findCandidates } from '../guardian.js';

// Stufe lesen
assert.equal(parseLevel('0'), 0);
assert.equal(parseLevel('3.0'), 3);
assert.equal(parseLevel(5), 5);
assert.equal(parseLevel('6'), null);
assert.equal(parseLevel('2.5'), null);
assert.equal(parseLevel('Stufe 2 – Wachsam'), 2);
assert.equal(parseLevel('unavailable'), null);
assert.equal(parseLevel(''), null);
assert.equal(levelOf({ state: 'Alarm', attributes: { stufe: 4 } }), 4);

// Beschreibung
assert.equal(describe({ state: '2', attributes: { beschreibung: 'Erhöhte Wachsamkeit' } }, 2), 'Erhöhte Wachsamkeit');
assert.equal(describe({ state: 'Stufe 3 – Bereitschaft', attributes: {} }, 3), 'Bereitschaft');
assert.equal(describe({ state: '1', attributes: {} }, 1, { 1: 'Beobachten' }), 'Beobachten');
assert.equal(describe({ state: '1', attributes: { label: '1' } }, 1), null);

// Suche
const c = findCandidates([
    { entity_id: 'automation.jarvis_guardian', state: 'on', attributes: {} },
    { entity_id: 'sensor.jarvis_guardian_stufe', state: '2', attributes: { friendly_name: 'Jarvis Guardian Stufe' } },
    { entity_id: 'light.kueche', state: 'on', attributes: {} },
    { entity_id: 'input_text.guardian_log', state: 'xyz', attributes: {} },
]);
assert.equal(c.length, 3);
assert.equal(c[0].entityId, 'sensor.jarvis_guardian_stufe');
assert.equal(c[0].level, 2);
assert.equal(c[c.length - 1].entityId, 'automation.jarvis_guardian');

console.log('guardian tests ok');

// Modus
{
    const { findModeCandidates } = await import('../guardian.js');
    const m = findModeCandidates([
        { entity_id: 'input_select.jarvis_guardian_modus', state: 'Nacht', attributes: {} },
        { entity_id: 'sensor.jarvis_guardian_stufe', state: '0', attributes: {} },
        { entity_id: 'automation.guardian_modus_wechsel', state: 'on', attributes: {} },
    ]);
    assert.equal(m[0].entityId, 'input_select.jarvis_guardian_modus');
    assert.equal(m.length, 2);
    console.log('guardian mode tests ok');
}
