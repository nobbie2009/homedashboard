import assert from 'node:assert/strict';
import { buildAgendaLines, printableCalendars, rangeLabel, berlinMidnightIso, wrap, slipAsText } from '../printer.js';

const config = {
    google: {
        selectedCalendars: ['papa', 'schule', 'rb', 'kinder'],
        calendarSettings: {
            papa: { alias: 'Papa', scopes: { weekView: true } },
            schule: { alias: 'Schule', scopes: { weekView: true, print: false } },
            rb: { alias: 'RB', scopes: { weekView: false } },
            kinder: { alias: 'Kinder', scopes: { weekView: false, print: true } },
        },
    },
};

// Kalenderauswahl: print-Scope schlägt weekView
{
    assert.deepEqual(printableCalendars(config), ['papa', 'kinder']);
    console.log('OK  printableCalendars');
}

// Gruppierung nach Tag, Uhrzeit in Berliner Zeit, ganztägig ohne Uhrzeit
{
    const events = [
        { summary: 'Zahnarzt', calendarId: 'papa', start: { dateTime: '2026-10-27T08:30:00Z' }, description: 'GEHEIM', location: 'Praxis' },
        { summary: 'Urlaub', calendarId: 'kinder', start: { date: '2026-10-26' }, end: { date: '2026-10-28' } },
        { summary: 'Früh', calendarId: 'papa', start: { dateTime: '2026-10-27T05:00:00Z' } },
        { summary: 'Außerhalb', calendarId: 'papa', start: { dateTime: '2026-11-05T10:00:00Z' } },
    ];
    const lines = buildAgendaLines(events, config, '2026-10-26', 3);
    assert.deepEqual(lines, [
        'Mo 26.10.',
        '  Urlaub (Kinder)',
        '',
        'Di 27.10.',
        '  Urlaub (Kinder)',
        '  06:00 Früh (Papa)',
        '  09:30 Zahnarzt (Papa)',
    ]);
    assert.ok(!lines.join('\n').includes('GEHEIM'));
    assert.ok(!lines.join('\n').includes('Praxis'));
    console.log('OK  buildAgendaLines');
}

// Sommerzeit: 25.10.2026 ist Umstellung, 23:30 UTC am 24. = 01:30 am 25.
{
    const events = [{ summary: 'Nacht', calendarId: 'papa', start: { dateTime: '2026-10-24T23:30:00Z' } }];
    assert.deepEqual(buildAgendaLines(events, config, '2026-10-25', 1), ['So 25.10.', '  01:30 Nacht (Papa)']);
    assert.equal(berlinMidnightIso('2026-07-01'), '2026-06-30T22:00:00.000Z');
    assert.equal(berlinMidnightIso('2026-12-01'), '2026-11-30T23:00:00.000Z');
    console.log('OK  Zeitzone');
}

{
    assert.equal(rangeLabel('2026-10-26', 7), 'Mo 26.10. – So 01.11.');
    assert.equal(rangeLabel('2026-10-26', 1), 'Mo 26.10.');
    assert.deepEqual(wrap('09:30 Elternabend in der Grundschule', 20), ['09:30 Elternabend in', '  der Grundschule']);
    assert.deepEqual(wrap('  09:30 Elternabend in der Schule', 20), ['  09:30 Elternabend', '    in der Schule']);
    assert.ok(slipAsText({ title: 'Termine', untertitel: 'x', zeilen: ['a'] }).startsWith('TERMINE\nx\n'));
    console.log('OK  Hilfsfunktionen');
}
