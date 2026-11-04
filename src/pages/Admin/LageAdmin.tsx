import React, { useEffect, useState } from 'react';
import { ShieldAlert, BellRing, Home as HomeIcon, Plus, Trash2, CalendarRange, PlayCircle, PlugZap } from 'lucide-react';
import { useConfig, LageConfig, LageHaAction } from '../../contexts/ConfigContext';
import { useSecurity } from '../../contexts/SecurityContext';
import { getApiUrl, fetchWithTimeout } from '../../utils/api';

const inputClass = "bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 w-full focus:outline-none focus:border-blue-500";
const labelClass = "block text-sm text-slate-500 dark:text-slate-400 mb-1";
const checkClass = "w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900";
const btnClass = "px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-sm flex items-center gap-2";

const CRITICAL_PUSH_DATA = JSON.stringify({
    title: '{titel}',
    message: '{text}',
    data: {
        tag: 'lage',
        // iOS: kritischer Ton auch bei „Nicht stören“
        push: { sound: { name: 'default', critical: 1, volume: 1.0 }, 'interruption-level': 'critical' },
        // Android: Alarm-Kanal, sofort zustellen
        ttl: 0,
        priority: 'high',
        channel: 'alarm_stream',
        importance: 'high',
    },
}, null, 2);

/** Vorschläge passend zu dieser Installation. Entity-IDs bitte prüfen! */
export const DEFAULT_LAGE_ACTIONS: LageHaAction[] = [
    {
        id: 'jarvis-kueche', label: 'Jarvis-Ansage Küche', enabled: true, type: 'service',
        service: 'assist_satellite.announce',
        data: JSON.stringify({ entity_id: 'assist_satellite.jarvis_ku', message: '{ansage}' }, null, 2),
    },
    {
        id: 'jarvis-haus', label: 'Jarvis-Ansage ganzes Haus (Alternative)', enabled: false, type: 'service',
        service: 'script.jarvis_ansage_ueberall',
        data: JSON.stringify({ nachricht: '{ansage}', lautstaerke: 70 }, null, 2),
    },
    {
        id: 'led-wohnzimmer', label: 'Unterschrank-LED Wohnzimmer rot blinkend', enabled: true, type: 'blink',
        entity: 'light.unterschrankled', seconds: 60,
    },
    {
        id: 'fritzfon', label: 'FritzFon-Rundruf (OG)', enabled: true, type: 'service',
        service: 'script.fritzfonturklingwlruf', data: '{}',
    },
    {
        id: 'handy-kritisch', label: 'Kritische Benachrichtigung Handy', enabled: false, type: 'service',
        service: 'notify.mobile_app_DEIN_HANDY', data: CRITICAL_PUSH_DATA,
    },
];

const isValidJson = (s?: string) => {
    if (!s || !s.trim()) return true;
    try { JSON.parse(s); return true; } catch { return false; }
};

/** Entity-IDs, die eine Aktion benutzt – für die lesende Verbindungsprüfung. */
const entitiesOf = (a: LageHaAction): string[] => {
    if (a.type === 'blink') return a.entity ? [a.entity] : [];
    const out: string[] = [];
    if (a.service?.startsWith('script.')) out.push(a.service);
    try {
        const d = a.data ? JSON.parse(a.data) : {};
        if (typeof d.entity_id === 'string') out.push(d.entity_id);
    } catch { /* ignorieren */ }
    return out;
};

export const LageAdmin: React.FC = () => {
    const { config, updateConfig } = useConfig();
    const { deviceId } = useSecurity();
    const lage: LageConfig = config.lage || {};
    const alarm = lage.alarm || {};
    const haCfg = alarm.ha || {};
    const actions: LageHaAction[] = haCfg.actions && haCfg.actions.length ? haCfg.actions : DEFAULT_LAGE_ACTIONS;

    const [haStatus, setHaStatus] = useState<{ url: string; configured: boolean; fromEnv: boolean } | null>(null);
    const [haUrl, setHaUrl] = useState('');
    const [haToken, setHaToken] = useState('');
    const [msg, setMsg] = useState<Record<string, string>>({});
    const [wikiText, setWikiText] = useState((lage.wikiArticles || []).join('\n'));

    const headers = { 'Content-Type': 'application/json', 'x-device-id': deviceId };
    const say = (key: string, text: string) => setMsg(m => ({ ...m, [key]: text }));

    const update = (partial: Partial<LageConfig>) => updateConfig({ lage: { ...lage, ...partial } });
    const updateAlarm = (partial: Partial<NonNullable<LageConfig['alarm']>>) => update({ alarm: { ...alarm, ...partial } });
    const updateHa = (partial: { enabled?: boolean; actions?: LageHaAction[] }) => updateAlarm({ ha: { ...haCfg, actions, ...partial } });
    const updateAction = (id: string, partial: Partial<LageHaAction>) =>
        updateHa({ actions: actions.map(a => (a.id === id ? { ...a, ...partial } : a)) });

    useEffect(() => {
        fetchWithTimeout(`${getApiUrl()}/api/lage/ha`, { headers: { 'x-device-id': deviceId } })
            .then(r => r.json())
            .then(s => { setHaStatus(s); setHaUrl(s.url || ''); })
            .catch(() => setHaStatus(null));
    }, [deviceId]);

    const post = async (path: string, body: unknown, key: string, timeout = 30000) => {
        say(key, '…');
        try {
            const res = await fetchWithTimeout(`${getApiUrl()}${path}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) }, timeout);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            return data;
        } catch (e) {
            say(key, `Fehler: ${(e as Error).message}`);
            return null;
        }
    };

    const saveHa = async () => {
        const d = await post('/api/lage/ha', { url: haUrl, token: haToken }, 'ha');
        if (d) { setHaStatus(d); setHaToken(''); say('ha', 'Gespeichert.'); }
    };

    const checkHa = async () => {
        const entities = [...new Set(actions.filter(a => a.enabled).flatMap(entitiesOf))];
        const d = await post('/api/lage/ha/check', { entities }, 'ha');
        if (d) {
            const lines = Object.entries(d.entities || {}).map(([id, r]: [string, any]) =>
                `${r.ok ? '✓' : '✗'} ${id}${r.ok ? ` (${r.name || r.state})` : ` – ${r.error}`}`);
            say('ha', [`Verbindung: ${d.message}`, ...lines].join('\n'));
        }
    };

    const testPopup = async () => {
        const d = await post('/api/lage/test-popup', {}, 'popup');
        if (d) say('popup', 'Test-Popup an alle Dashboards gesendet.');
    };

    const testAction = async (a: LageHaAction) => {
        if (!window.confirm(`„${a.label}“ wird jetzt WIRKLICH ausgelöst (Gerät, Ansage, Anruf …). Fortfahren?`)) return;
        const d = await post('/api/lage/test-action', { action: a, confirm: true }, a.id, 90000);
        if (d) say(a.id, `Ausgelöst: ${d.info}`);
    };

    const testAll = async () => {
        if (!window.confirm('Komplette Alarmkette als TEST auslösen? Push, Ansage, Licht und Telefon werden wirklich ausgelöst.')) return;
        const d = await post('/api/lage/test-alarm', { confirm: true }, 'all', 90000);
        if (d) say('all', d.results.map((r: any) => `${r.ok ? '✓' : '✗'} ${r.channel}${r.error ? ` – ${r.error}` : ''}`).join('\n'));
    };

    const kontext = lage.kontext || [];

    return (
        <div className="space-y-10">
            {/* Allgemein */}
            <section>
                <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" /> Lage-Index
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-3xl">
                    Eigener, inoffizieller Indikator für die Gefahr von außen (LAGE 5 normal … LAGE 1 akut). Amtliche Warnungen
                    (NINA, BfS-Strahlung) setzen eine Untergrenze; Flugbewegungen (Flugbereitschaft, A400M, AWACS/Tanker an der Ostflanke),
                    Bundestag (Feeds + Sitzungskalender), NATO (News + Media Advisories), Tagesschau und Suchinteresse bilden die
                    Indikatoren. LAGE 1 ist nur über amtliche Quellen erreichbar.
                </p>
                <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
                    <label className="flex items-center gap-3">
                        <input type="checkbox" className={checkClass} checked={lage.enabled !== false} onChange={e => update({ enabled: e.target.checked })} />
                        <span>Lage-Index aktiv</span>
                    </label>
                    <label className="flex items-center gap-3">
                        <input type="checkbox" className={checkClass} checked={lage.showInHeader !== false} onChange={e => update({ showInHeader: e.target.checked })} />
                        <span>Button im Header (öffnet die Übersicht als Popup)</span>
                    </label>
                    <div>
                        <label className={labelClass}>Regionalschlüssel Landkreis (ARS, für NINA)</label>
                        <input className={inputClass} value={lage.ars || ''} placeholder="160620000000 (Landkreis Nordhausen)"
                            onChange={e => update({ ars: e.target.value || undefined })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className={labelClass}>Breite (optional)</label>
                            <input type="number" step="0.01" className={inputClass} value={lage.lat ?? ''} placeholder="Wetter-Standort"
                                onChange={e => update({ lat: e.target.value === '' ? undefined : parseFloat(e.target.value) })} />
                        </div>
                        <div>
                            <label className={labelClass}>Länge (optional)</label>
                            <input type="number" step="0.01" className={inputClass} value={lage.lon ?? ''} placeholder="Wetter-Standort"
                                onChange={e => update({ lon: e.target.value === '' ? undefined : parseFloat(e.target.value) })} />
                        </div>
                    </div>
                    <div>
                        <label className={labelClass}>Strahlung: Umkreis (km)</label>
                        <input type="number" className={inputClass} value={lage.radiationRadiusKm ?? 100}
                            onChange={e => update({ radiationRadiusKm: parseInt(e.target.value, 10) || 100 })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className={labelClass}>Warnschwelle µSv/h (→ LAGE 3)</label>
                            <input type="number" step="0.05" className={inputClass} value={lage.radiationWarn ?? 0.3}
                                onChange={e => update({ radiationWarn: parseFloat(e.target.value) || 0.3 })} />
                        </div>
                        <div>
                            <label className={labelClass}>Alarmschwelle µSv/h (→ LAGE 1)</label>
                            <input type="number" step="0.05" className={inputClass} value={lage.radiationAlarm ?? 0.8}
                                onChange={e => update({ radiationAlarm: parseFloat(e.target.value) || 0.8 })} />
                        </div>
                    </div>
                    <div className="md:col-span-2">
                        <label className={labelClass}>Wikipedia-Artikel für das Suchinteresse (einer pro Zeile, leer = Standardliste)</label>
                        <textarea rows={4} className={inputClass} value={wikiText}
                            placeholder={'Verteidigungsfall\nSchutzraum\nKaliumiodid\n…'}
                            onChange={e => setWikiText(e.target.value)}
                            onBlur={() => update({ wikiArticles: wikiText.split(/[\n,]/).map(s => s.trim()).filter(Boolean) })} />
                    </div>
                </div>
            </section>

            {/* Manuell & Kontext */}
            <section>
                <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                    <CalendarRange className="w-5 h-5" /> Manuelle Stufe & Kontext
                </h3>
                <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
                    <div>
                        <label className={labelClass}>Manuelle Untergrenze</label>
                        <select className={inputClass} value={lage.manualLevel ?? ''}
                            onChange={e => update({ manualLevel: e.target.value ? parseInt(e.target.value, 10) : null })}>
                            <option value="">aus</option>
                            <option value="4">LAGE 4 – Auffällig</option>
                            <option value="3">LAGE 3 – Erhöht</option>
                            <option value="2">LAGE 2 – Angespannt</option>
                            <option value="1">LAGE 1 – Akut</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Begründung</label>
                        <input className={inputClass} value={lage.manualNote || ''} placeholder="z. B. Sirenenalarm gehört"
                            onChange={e => update({ manualNote: e.target.value })} />
                    </div>
                </div>
                <div className="mt-6 max-w-3xl">
                    <div className={labelClass}>
                        Kontext-Ereignisse (Manöver, Gipfel, Großlagen): im Zeitraum zählen Luft und Politik nur halb.
                    </div>
                    <div className="space-y-2">
                        {kontext.map(k => (
                            <div key={k.id} className="flex gap-2 items-center">
                                <input className={inputClass} value={k.label} placeholder="z. B. NATO-Manöver Steadfast"
                                    onChange={e => update({ kontext: kontext.map(x => x.id === k.id ? { ...x, label: e.target.value } : x) })} />
                                <input type="date" className={`${inputClass} w-44`} value={k.from}
                                    onChange={e => update({ kontext: kontext.map(x => x.id === k.id ? { ...x, from: e.target.value } : x) })} />
                                <input type="date" className={`${inputClass} w-44`} value={k.to}
                                    onChange={e => update({ kontext: kontext.map(x => x.id === k.id ? { ...x, to: e.target.value } : x) })} />
                                <button className="p-2 text-red-500" onClick={() => update({ kontext: kontext.filter(x => x.id !== k.id) })}>
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                        <button className={btnClass} onClick={() => {
                            const today = new Date().toISOString().slice(0, 10);
                            update({ kontext: [...kontext, { id: `k${Date.now()}`, label: '', from: today, to: today }] });
                        }}>
                            <Plus className="w-4 h-4" /> Ereignis hinzufügen
                        </button>
                    </div>
                </div>
            </section>

            {/* Alarmierung */}
            <section>
                <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <BellRing className="w-5 h-5" /> Alarmierung
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-3xl">
                    Alarmiert wird beim Erreichen der Alarmstufe und bei jeder weiteren Verschlechterung – nicht wiederholt,
                    solange die Lage anhält. Das Popup auf den Dashboards erscheint immer; Push und Home Assistant nur,
                    wenn „Alarmierung aktiv“ eingeschaltet ist.
                </p>
                <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
                    <label className="flex items-center gap-3">
                        <input type="checkbox" className={checkClass} checked={alarm.enabled === true} onChange={e => updateAlarm({ enabled: e.target.checked })} />
                        <span className="font-semibold">Alarmierung aktiv (Push & Home Assistant)</span>
                    </label>
                    <div>
                        <label className={labelClass}>Alarm ab Stufe</label>
                        <select className={inputClass} value={alarm.minLevel ?? 2} onChange={e => updateAlarm({ minLevel: parseInt(e.target.value, 10) })}>
                            <option value={3}>LAGE 3 – Erhöht</option>
                            <option value={2}>LAGE 2 – Angespannt (empfohlen)</option>
                            <option value={1}>LAGE 1 – Akut</option>
                        </select>
                    </div>
                    <label className="flex items-center gap-3">
                        <input type="checkbox" className={checkClass} checked={alarm.popup !== false} onChange={e => updateAlarm({ popup: e.target.checked })} />
                        <span>Popup auf allen Dashboards</span>
                    </label>
                    <label className="flex items-center gap-3">
                        <input type="checkbox" className={checkClass} checked={alarm.push !== false} onChange={e => updateAlarm({ push: e.target.checked })} />
                        <span>Web-Push an FamilyHub-App (PWA)</span>
                    </label>
                    <div>
                        <label className={labelClass}>Sperrzeit nach Entwarnung (Stunden)</label>
                        <input type="number" className={inputClass} value={alarm.cooldownHours ?? 6}
                            onChange={e => updateAlarm({ cooldownHours: parseInt(e.target.value, 10) || 6 })} />
                    </div>
                    <div className="flex items-end gap-3">
                        <button className={btnClass} onClick={testPopup}>
                            <PlayCircle className="w-4 h-4" /> Popup testen (nur Bildschirme)
                        </button>
                    </div>
                    {msg.popup && <div className="md:col-span-2 text-xs font-mono text-slate-500">{msg.popup}</div>}
                </div>
            </section>

            {/* Home Assistant */}
            <section>
                <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-2">
                    <HomeIcon className="w-5 h-5" /> Home Assistant
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-3xl">
                    Zugang über einen Long-Lived-Token (HA → Profil → Sicherheit). Der Token liegt nur auf dem Server
                    und wird nie an die Tablets ausgeliefert. „Verbindung prüfen“ liest nur – es wird nichts ausgelöst.
                </p>
                <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
                    <div>
                        <label className={labelClass}>Home-Assistant-URL</label>
                        <input className={inputClass} value={haUrl} placeholder="http://homeassistant.local:8123" onChange={e => setHaUrl(e.target.value)} />
                    </div>
                    <div>
                        <label className={labelClass}>Token {haStatus?.configured ? '(gespeichert – leer lassen zum Behalten)' : ''}</label>
                        <input type="password" className={inputClass} value={haToken} placeholder="eyJ…" onChange={e => setHaToken(e.target.value)} />
                    </div>
                    <div className="md:col-span-2 flex flex-wrap gap-3 items-center">
                        <button className={btnClass} onClick={saveHa}>Zugang speichern</button>
                        <button className={btnClass} onClick={checkHa}><PlugZap className="w-4 h-4" /> Verbindung prüfen (nur lesend)</button>
                        <span className="text-xs text-slate-500">
                            {haStatus ? (haStatus.configured ? `eingerichtet${haStatus.fromEnv ? ' (aus .env)' : ''}` : 'nicht eingerichtet') : ''}
                        </span>
                    </div>
                    {msg.ha && <pre className="md:col-span-2 text-xs font-mono text-slate-500 whitespace-pre-wrap">{msg.ha}</pre>}
                    <label className="flex items-center gap-3 md:col-span-2">
                        <input type="checkbox" className={checkClass} checked={haCfg.enabled === true} onChange={e => updateHa({ enabled: e.target.checked })} />
                        <span className="font-semibold">Home-Assistant-Aktionen bei Alarm ausführen</span>
                    </label>
                </div>

                <div className="space-y-4 mt-6 max-w-3xl">
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                        Platzhalter in den Daten: <code>{'{titel}'}</code> <code>{'{text}'}</code> <code>{'{ansage}'}</code> <code>{'{stufe}'}</code>.
                        Die Vorschläge sind auf dieses Haus zugeschnitten – Entity-IDs bitte mit „Verbindung prüfen“ kontrollieren.
                    </div>
                    {actions.map(a => (
                        <div key={a.id} className="rounded-xl border border-slate-300 dark:border-slate-700 p-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <input type="checkbox" className={checkClass} checked={a.enabled} onChange={e => updateAction(a.id, { enabled: e.target.checked })} />
                                <input className={`${inputClass} font-semibold`} value={a.label} onChange={e => updateAction(a.id, { label: e.target.value })} />
                                <select className={`${inputClass} w-40`} value={a.type} onChange={e => updateAction(a.id, { type: e.target.value as LageHaAction['type'] })}>
                                    <option value="service">Dienst</option>
                                    <option value="blink">Licht blinken</option>
                                </select>
                                <button className="p-2 text-red-500" title="Entfernen" onClick={() => updateHa({ actions: actions.filter(x => x.id !== a.id) })}>
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                            {a.type === 'blink' ? (
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="col-span-2">
                                        <label className={labelClass}>Licht-Entity</label>
                                        <input className={inputClass} value={a.entity || ''} placeholder="light.unterschrankled" onChange={e => updateAction(a.id, { entity: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Sekunden blinken</label>
                                        <input type="number" className={inputClass} value={a.seconds ?? 60} onChange={e => updateAction(a.id, { seconds: parseInt(e.target.value, 10) || 60 })} />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <label className={labelClass}>Dienst</label>
                                        <input className={inputClass} value={a.service || ''} placeholder="script.fritzfonturklingwlruf" onChange={e => updateAction(a.id, { service: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Daten (JSON) {!isValidJson(a.data) && <span className="text-red-500">– ungültiges JSON</span>}</label>
                                        <textarea rows={Math.min(14, (a.data || '').split('\n').length + 1)} className={`${inputClass} font-mono text-xs`}
                                            value={a.data || ''} onChange={e => updateAction(a.id, { data: e.target.value })} />
                                    </div>
                                </>
                            )}
                            <div className="flex items-center gap-3">
                                <button className={btnClass} onClick={() => testAction(a)}>
                                    <PlayCircle className="w-4 h-4" /> Einzeln auslösen (echt)
                                </button>
                                {msg[a.id] && <span className="text-xs font-mono text-slate-500">{msg[a.id]}</span>}
                            </div>
                        </div>
                    ))}
                    <div className="flex flex-wrap gap-3">
                        <button className={btnClass} onClick={() => updateHa({
                            actions: [...actions, { id: `a${Date.now()}`, label: 'Neue Aktion', enabled: false, type: 'service', service: '', data: '{}' }],
                        })}>
                            <Plus className="w-4 h-4" /> Aktion hinzufügen
                        </button>
                        <button className={btnClass} onClick={() => {
                            if (window.confirm('Aktionen auf die Vorschläge zurücksetzen?')) updateHa({ actions: DEFAULT_LAGE_ACTIONS });
                        }}>
                            Vorschläge wiederherstellen
                        </button>
                        <button className={`${btnClass} !bg-red-600 !text-white hover:!bg-red-700`} onClick={testAll}>
                            <BellRing className="w-4 h-4" /> Komplette Alarmkette testen (echt)
                        </button>
                    </div>
                    {msg.all && <pre className="text-xs font-mono text-slate-500 whitespace-pre-wrap">{msg.all}</pre>}
                </div>
            </section>
        </div>
    );
};

export default LageAdmin;
