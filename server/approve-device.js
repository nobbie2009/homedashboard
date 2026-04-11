#!/usr/bin/env node
/**
 * CLI-Tool zur Geräte-Freigabe
 *
 * Listet alle registrierten Geräte aus server/data/devices.json auf und
 * erlaubt per Zeilennummer die Aktion (Freigeben / Ablehnen / Löschen).
 *
 * Start:
 *   node server/approve-device.js
 *
 * Im Docker-Container:
 *   docker compose exec backend node /app/server/approve-device.js
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEVICES_FILE = path.join(__dirname, 'data', 'devices.json');

// ANSI Farben
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
};

function loadDevices() {
    if (!fs.existsSync(DEVICES_FILE)) {
        console.error(`${C.red}Keine devices.json gefunden unter:${C.reset} ${DEVICES_FILE}`);
        console.error(`${C.dim}(Datei wird erst angelegt, sobald sich ein Gerät registriert.)${C.reset}`);
        process.exit(1);
    }
    try {
        return JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
    } catch (e) {
        console.error(`${C.red}Fehler beim Lesen von devices.json:${C.reset}`, e.message);
        process.exit(1);
    }
}

function saveDevices(devices) {
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2));
}

function statusBadge(status) {
    switch (status) {
        case 'approved': return `${C.green}●  approved${C.reset}`;
        case 'pending':  return `${C.yellow}●  pending ${C.reset}`;
        case 'rejected': return `${C.red}●  rejected${C.reset}`;
        default:         return `${C.gray}●  ${status}${C.reset}`;
    }
}

function formatDate(iso) {
    if (!iso) return '-';
    try {
        const d = new Date(iso);
        return d.toLocaleString('de-DE');
    } catch {
        return iso;
    }
}

function shortUA(ua) {
    if (!ua) return '';
    // Kurzform: Browser + OS grob raus
    const s = ua.substring(0, 60);
    return s.length < ua.length ? s + '…' : s;
}

function render(devices) {
    const list = Object.values(devices);
    // Sortierung: pending zuerst, dann zuletzt gesehen
    list.sort((a, b) => {
        const order = { pending: 0, approved: 1, rejected: 2 };
        const oa = order[a.status] ?? 9;
        const ob = order[b.status] ?? 9;
        if (oa !== ob) return oa - ob;
        return (b.lastSeen || '').localeCompare(a.lastSeen || '');
    });

    console.clear();
    console.log(`${C.bold}${C.cyan}=== HomeDashboard: Geräte-Verwaltung ===${C.reset}`);
    console.log(`${C.dim}Datei:${C.reset}   ${DEVICES_FILE}`);
    console.log(`${C.dim}Gesamt:${C.reset}  ${list.length} Gerät(e)\n`);

    if (list.length === 0) {
        console.log(`${C.dim}Keine registrierten Geräte.${C.reset}\n`);
        return list;
    }

    list.forEach((d, i) => {
        const num = String(i + 1).padStart(2, ' ');
        console.log(`${C.bold}${num}${C.reset}  ${statusBadge(d.status)}  ${C.bold}${d.name}${C.reset}`);
        console.log(`     ${C.dim}IP:${C.reset}        ${d.ip || '-'}`);
        console.log(`     ${C.dim}Zuletzt:${C.reset}   ${formatDate(d.lastSeen)}`);
        console.log(`     ${C.dim}ID:${C.reset}        ${d.id}`);
        if (d.userAgent) {
            console.log(`     ${C.dim}Agent:${C.reset}     ${shortUA(d.userAgent)}`);
        }
        console.log('');
    });

    return list;
}

function printMenu() {
    console.log(`${C.bold}Aktionen:${C.reset}`);
    console.log(`  ${C.green}<Nr>${C.reset}               Gerät ${C.green}freigeben${C.reset} (approve)`);
    console.log(`  ${C.red}r <Nr>${C.reset}             Gerät ${C.red}ablehnen${C.reset} (reject)`);
    console.log(`  ${C.yellow}p <Nr>${C.reset}             Gerät auf ${C.yellow}pending${C.reset} setzen`);
    console.log(`  ${C.red}d <Nr>${C.reset}             Gerät ${C.red}löschen${C.reset}`);
    console.log(`  ${C.green}add <uuid> [name]${C.reset}  Gerät manuell hinzufügen und freigeben`);
    console.log(`  ${C.cyan}l${C.reset}                  Liste neu laden`);
    console.log(`  ${C.cyan}q${C.reset}                  beenden`);
    console.log('');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function prompt() {
    rl.question(`${C.bold}>${C.reset} `, (answer) => {
        const input = answer.trim().toLowerCase();

        if (!input) return prompt();

        if (input === 'q' || input === 'quit' || input === 'exit') {
            rl.close();
            return;
        }

        if (input === 'l' || input === 'list') {
            render(loadDevices());
            printMenu();
            return prompt();
        }

        // add <uuid> [name]  -> legt Gerät direkt als approved an
        const addMatch = answer.trim().match(/^add\s+([0-9a-fA-F-]+)(?:\s+(.+))?$/);
        if (addMatch) {
            const uuid = addMatch[1];
            const name = (addMatch[2] || 'Manuell hinzugefügt').trim();
            if (!UUID_RE.test(uuid)) {
                console.log(`${C.red}Ungültige UUID-Form.${C.reset} Erwartet: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx\n`);
                return prompt();
            }
            const devices = loadDevices();
            const existing = devices[uuid];
            devices[uuid] = {
                id: uuid,
                name: existing?.name || name,
                status: 'approved',
                firstSeen: existing?.firstSeen || new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                ip: existing?.ip || 'manual',
                userAgent: existing?.userAgent || 'manual-cli',
            };
            saveDevices(devices);
            console.log(`${C.green}✓ Gerät ${existing ? 'aktualisiert' : 'hinzugefügt'} und freigegeben:${C.reset} ${devices[uuid].name} (${uuid})\n`);
            render(loadDevices());
            printMenu();
            return prompt();
        }

        // Parse: [aktion] <nummer>
        let action = 'approved';
        let numStr = input;
        const match = input.match(/^([rpd])\s+(\d+)$/);
        if (match) {
            const actionMap = { r: 'rejected', p: 'pending', d: 'delete' };
            action = actionMap[match[1]];
            numStr = match[2];
        }

        const idx = parseInt(numStr, 10);
        if (isNaN(idx) || idx < 1) {
            console.log(`${C.red}Ungültige Eingabe.${C.reset} Bitte eine Zeilennummer oder 'q' eingeben.\n`);
            return prompt();
        }

        const devices = loadDevices();
        const list = Object.values(devices).sort((a, b) => {
            const order = { pending: 0, approved: 1, rejected: 2 };
            const oa = order[a.status] ?? 9;
            const ob = order[b.status] ?? 9;
            if (oa !== ob) return oa - ob;
            return (b.lastSeen || '').localeCompare(a.lastSeen || '');
        });

        const device = list[idx - 1];
        if (!device) {
            console.log(`${C.red}Kein Gerät mit Nummer ${idx}.${C.reset}\n`);
            return prompt();
        }

        if (action === 'delete') {
            delete devices[device.id];
            saveDevices(devices);
            console.log(`${C.red}✗ Gelöscht:${C.reset} ${device.name} (${device.id})\n`);
        } else {
            devices[device.id].status = action;
            saveDevices(devices);
            const color = action === 'approved' ? C.green : action === 'rejected' ? C.red : C.yellow;
            console.log(`${color}✓ Status gesetzt:${C.reset} ${device.name} → ${action}\n`);
        }

        // Neu rendern
        render(loadDevices());
        printMenu();
        prompt();
    });
}

// Start
render(loadDevices());
printMenu();
prompt();

rl.on('close', () => {
    console.log(`\n${C.dim}Auf Wiedersehen.${C.reset}`);
    process.exit(0);
});
