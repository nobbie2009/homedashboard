import assert from 'node:assert/strict';
import {
    zScore, pointsFromZ, matchNews, newsIndicatorPoints, newsFloors, decay,
    ninaLocalLevel, ninaNationalLevel, radiationLevel, computeGroups,
    computeIndicatorLevel, combineLevels, applyHysteresis, shouldAlarm,
    activeKontext, fillTemplate,
} from '../lage.js';

const H = 3600000;
const now = Date.UTC(2026, 10, 3, 12, 0, 0);

// Statistik
{
    const base = Array(100).fill(2);
    assert.equal(zScore(2, base).z, 0);
    assert.equal(zScore(5, base).z, 3); // std 0 → Mindeststreuung 1
    assert.equal(pointsFromZ(1.9), 0);
    assert.equal(pointsFromZ(2), 1);
    assert.equal(pointsFromZ(3.2), 2);
    assert.equal(pointsFromZ(5), 3);
    assert.equal(pointsFromZ(NaN), 0);
    console.log('OK  Statistik');
}

// Nachrichten-Regeln
{
    const ids = (title) => matchNews({ title }).map(r => r.id);
    assert.deepEqual(ids('Polen beantragt Konsultationen nach Artikel 4 des NATO-Vertrags'), ['nato-art4']);
    assert.deepEqual(ids('Drohnen über Flughafen München – Flugbetrieb eingestellt'), ['drohnen']);
    assert.deepEqual(ids('Bundestag kommt zu Sondersitzung zusammen'), ['sondersitzung']);
    assert.deepEqual(ids('Nationaler Sicherheitsrat tagt'), ['sicherheitsrat']);
    assert.deepEqual(ids('Luftraum über Ostpolen gesperrt'), ['luftraum-sperre']);
    assert.deepEqual(ids('Bundestag stellt Verteidigungsfall festgestellt'), ['spannungsfall']);
    assert.deepEqual(ids('Kanzler sagt Reise nach China ab'), ['reise-abgesagt']);
    // Hypothetische Debatten lösen keine Untergrenze aus
    assert.deepEqual(ids('Was der Verteidigungsfall für Bürger bedeuten würde'), []);
    assert.deepEqual(ids('Wie funktioniert Artikel 5 der NATO?'), []);
    assert.deepEqual(ids('Wetter: Sonne am Wochenende'), []);
    console.log('OK  Nachrichten-Regeln');
}

// Abklingen und Punkte
{
    assert.equal(decay(2, 24), 1);
    assert.equal(decay(2, 0), 2);
    const events = [
        { indicator: 'drohnen', points: 2, breaking: true, ts: now, title: 'a', ruleId: 'drohnen' },
        { indicator: 'drohnen', points: 2, breaking: false, ts: now - 24 * H, title: 'b', ruleId: 'drohnen' },
        { indicator: 'parlament', points: 2, breaking: false, ts: now - 100 * H, title: 'alt', ruleId: 'sondersitzung' },
    ];
    const p = newsIndicatorPoints(events, now);
    assert.equal(p.drohnen.points, 3); // 3 + 1, gedeckelt
    assert.equal(p.parlament, undefined); // älter als 72 h
    const floors = newsFloors([{ floor: 2, ts: now - H, title: 'VF' }, { floor: 2, ts: now - 80 * H, title: 'alt' }], now);
    assert.equal(floors.length, 1);
    assert.equal(floors[0].level, 2);
    console.log('OK  Abklingen');
}

// NINA
{
    assert.equal(ninaLocalLevel({ id: 'dwd.2.49', severity: 'Extreme', headline: 'Orkan' }), null);
    assert.equal(ninaLocalLevel({ id: 'mow.DE-TH-1', severity: 'Minor', headline: 'Luftalarm – Schutz suchen' }), 1);
    assert.equal(ninaLocalLevel({ id: 'mow.DE-TH-1', severity: 'Severe', headline: 'Großbrand' }), 3);
    assert.equal(ninaLocalLevel({ id: 'kat.1', severity: 'Extreme', headline: 'Bombenentschärfung' }), 2);
    assert.equal(ninaLocalLevel({ id: 'mow.1', severity: 'Minor', headline: 'Trinkwasser' }), null);
    assert.equal(ninaNationalLevel({ severity: 'Minor', title: 'Luftangriff' }), null);
    assert.equal(ninaNationalLevel({ severity: 'Extreme', title: 'Großbrand' }), null);
    assert.equal(ninaNationalLevel({ severity: 'Extreme', title: 'Luftangriff – Schutzraum aufsuchen' }), 2);
    console.log('OK  NINA');
}

// Strahlung
{
    assert.equal(radiationLevel([{ value: 0.1 }, { value: 0.12 }]).level, null);
    assert.equal(radiationLevel([{ value: 0.9 }, { value: 0.1 }]).level, null); // eine Sonde allein zählt nicht
    assert.equal(radiationLevel([{ value: 0.35 }, { value: 0.4 }]).level, 3);
    assert.equal(radiationLevel([{ value: 1.2 }, { value: 0.9 }]).level, 1);
    console.log('OK  Strahlung');
}

// Gesamtbewertung
{
    const lvl = (indicators, opts) => {
        const groups = computeGroups(indicators, opts);
        return computeIndicatorLevel(indicators, groups);
    };
    assert.equal(lvl({}).level, 5);
    // Öffentlichkeit allein löst nichts aus
    assert.equal(lvl({ suchinteresse: { points: 3 }, eilmeldungen: { points: 3 } }).level, 5);
    // Ein starkes Einzelsignal → 4
    assert.equal(lvl({ militaerluft: { points: 2 } }).level, 4);
    // Zwei Gruppen, Gesamt ≥ 5 → 3
    assert.equal(lvl({ militaerluft: { points: 3 }, parlament: { points: 2 } }).level, 3);
    // Alle Gruppen, Gesamt ≥ 9 → 2
    assert.equal(lvl({ militaerluft: { points: 3 }, luftraum: { points: 2 }, parlament: { points: 2 }, krisenstab: { points: 2 }, suchinteresse: { points: 2 } }).level, 2);
    // Ohne Öffentlichkeit bleibt es bei 3
    assert.equal(lvl({ militaerluft: { points: 3 }, luftraum: { points: 3 }, parlament: { points: 3 }, krisenstab: { points: 3 } }).level, 3);
    // Art. 4 → 2
    assert.equal(lvl({ nato: { points: 3, events: [{ ruleId: 'nato-art4', decayed: 3 }] } }).level, 2);
    // Kontext (Manöver) halbiert Luft/Politik
    assert.equal(lvl({ militaerluft: { points: 3 }, parlament: { points: 2 } }, { kontextActive: true }).level, 4);
    console.log('OK  Gesamtbewertung');
}

// Untergrenzen
{
    assert.equal(combineLevels(4, []).level, 4);
    assert.equal(combineLevels(4, [{ level: 1, source: 'NINA' }]).level, 1);
    assert.equal(combineLevels(2, [{ level: 3 }]).level, 2);
    console.log('OK  Untergrenzen');
}

// Glättung
{
    let s = applyHysteresis(null, 4, now);
    assert.equal(s.level, 4);
    s = applyHysteresis(s, 2, now + 1000);
    assert.equal(s.level, 2); // sofort schlechter
    s = applyHysteresis(s, 5, now + 2000);
    assert.equal(s.level, 2); // noch nicht besser
    s = applyHysteresis(s, 5, now + 2000 + 61 * 60000);
    assert.equal(s.level, 5);
    console.log('OK  Glättung');
}

// Alarm-Entscheidung
{
    assert.equal(shouldAlarm(3, 2, null, now), false);
    assert.equal(shouldAlarm(2, 2, null, now), true);
    assert.equal(shouldAlarm(2, 2, { level: 2, ts: now - H }, now), false);
    assert.equal(shouldAlarm(1, 2, { level: 2, ts: now - H }, now), true);
    assert.equal(shouldAlarm(2, 2, { level: 2, ts: now - 7 * H }, now), false); // hält noch an
    assert.equal(shouldAlarm(2, 2, { level: 2, ts: now - 2 * H, resolvedAt: now - H }, now), false); // Sperrzeit
    assert.equal(shouldAlarm(2, 2, { level: 2, ts: now - 7 * H, resolvedAt: now - H }, now), true);
    console.log('OK  Alarm-Entscheidung');
}

// Kontext und Vorlagen
{
    const k = [{ from: '2026-11-01', to: '2026-11-05', label: 'Manöver' }, { from: '2026-12-01', to: '2026-12-02' }];
    assert.equal(activeKontext(k, now).length, 1);
    assert.deepEqual(
        fillTemplate({ message: 'LAGE {stufe}: {text}', data: { list: ['{titel}'] }, n: 3 }, { stufe: 2, text: 'X', titel: 'T' }),
        { message: 'LAGE 2: X', data: { list: ['T'] }, n: 3 }
    );
    console.log('OK  Kontext/Vorlagen');
}

console.log('Alle LAGE-Tests bestanden.');
