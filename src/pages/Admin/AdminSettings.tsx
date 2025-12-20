import React, { useState, useEffect } from 'react';
import { useKiosk } from '../../contexts/KioskContext';
import { useConfig } from '../../contexts/ConfigContext';
import { useSecurity } from '../../contexts/SecurityContext';
import { Lock, Save, Calendar as CalendarIcon, CheckCircle, Upload, Download, Smartphone, Trash2, Shield, ShieldAlert } from 'lucide-react';
// import clsx from 'clsx';

import { getApiUrl } from '../../utils/api';

const DeviceList = () => {
    const { deviceId } = useSecurity();
    const [devices, setDevices] = useState<any[]>([]);
    const API_URL = getApiUrl();

    const fetchDevices = () => {
        fetch(`${API_URL}/api/auth/devices`, { headers: { 'x-device-id': deviceId } })
            .then(res => res.json())
            .then(setDevices)
            .catch(console.error);
    };

    useEffect(() => {
        fetchDevices();
    }, []);

    const toggleStatus = (id: string, currentStatus: string) => {
        const newStatus = currentStatus === 'approved' ? 'rejected' : 'approved';
        fetch(`${API_URL}/api/auth/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-device-id': deviceId
            },
            body: JSON.stringify({ id, status: newStatus })
        }).then(() => fetchDevices());
    };

    const deleteDevice = (id: string) => {
        if (!confirm("Gerät wircklich löschen?")) return;
        fetch(`${API_URL}/api/auth/device/${id}`, {
            method: 'DELETE',
            headers: { 'x-device-id': deviceId }
        }).then(() => fetchDevices());
    };

    return (
        <section>
            <h3 className="text-xl font-semibold text-slate-300 mb-4">Geräte verwalten</h3>
            <div className="space-y-3">
                {devices.map(d => (
                    <div key={d.id} className={`flex items-center justify-between p-4 rounded-lg border ${d.status === 'approved' ? 'bg-slate-900/40 border-green-900/30' : 'bg-slate-800 border-yellow-900/30'}`}>
                        <div className="flex items-center space-x-3">
                            {d.status === 'approved' ? <Shield className="text-green-500 w-6 h-6" /> : <ShieldAlert className="text-yellow-500 w-6 h-6" />}
                            <div>
                                <div className="font-bold text-white flex items-center gap-2">
                                    {d.name}
                                    {d.id === deviceId && <span className="text-xs bg-blue-600 px-2 py-0.5 rounded-full">Aktuelles Gerät</span>}
                                </div>
                                <div className="text-xs text-slate-500 font-mono">{d.ip} • {new Date(d.lastSeen).toLocaleString()}</div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => toggleStatus(d.id, d.status)}
                                className={`px-3 py-1.5 rounded text-sm font-bold transition ${d.status === 'approved' ? 'bg-slate-800 text-slate-400 hover:bg-red-900/20 hover:text-red-400' : 'bg-green-600 text-white hover:bg-green-500'}`}
                            >
                                {d.status === 'approved' ? 'Sperren' : 'Freigeben'}
                            </button>
                            <button
                                onClick={() => deleteDevice(d.id)}
                                className="p-2 text-slate-500 hover:text-red-500 transition"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

const AdminSettings: React.FC = () => {
    const { isLocked, unlock, lock } = useKiosk();
    const { config, updateConfig } = useConfig();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [remoteCalendars, setRemoteCalendars] = useState<any[]>([]);
    const [isGoogleAuth, setIsGoogleAuth] = useState(false);
    const [activeTab, setActiveTab] = useState('kalender');

    const tabs = [
        { id: 'kalender', label: 'Kalender', icon: CalendarIcon },
        { id: 'zugangsdaten', label: 'Zugangsdaten', icon: Lock },
        { id: 'ansicht', label: 'Ansicht', icon: CheckCircle }, // Reusing CheckCircle as generic icon for View
        { id: 'extern', label: 'Externe Daten', icon: Upload }, // Reusing Upload/Download/Server equivalent
        { id: 'backup', label: 'Datensicherung', icon: Save },
        { id: 'geraete', label: 'Sicherheit', icon: Smartphone },
    ];

    // Use env var or default to localhost
    const API_URL = getApiUrl();

    useEffect(() => {
        // Check URL for auth status
        const params = new URLSearchParams(window.location.search);
        if (params.get('googleAuth') === 'success') {
            setIsGoogleAuth(true);
            window.history.replaceState({}, '', window.location.pathname);
        }

        // Fetch remote calendars
        fetch(`${API_URL}/api/google/calendars`)
            .then(res => {
                if (res.ok) {
                    setIsGoogleAuth(true); // If we can fetch, we are auth'd
                    return res.json();
                }
                throw new Error("Not authenticated");
            })
            .then(data => {
                if (Array.isArray(data)) setRemoteCalendars(data);
            })
            .catch(() => setIsGoogleAuth(false));
    }, []);

    const handleUnlock = () => {
        if (unlock(pin)) {
            setPin('');
            setError('');
        } else {
            setError('Falsche PIN');
            setPin('');
        }
    };



    const handleToggleGoogleCalendar = (calId: string) => {
        const current = config.google?.selectedCalendars || [];
        const newSelection = current.includes(calId)
            ? current.filter(id => id !== calId)
            : [...current, calId];
        updateConfig({ google: { ...config.google, selectedCalendars: newSelection } });
    };

    const handleExport = () => {
        window.open(`${API_URL}/api/config/backup`, '_blank');
    };

    const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = JSON.parse(e.target?.result as string);
                const res = await fetch(`${API_URL}/api/config/restore`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(json)
                });
                if (res.ok) {
                    alert('Einstellungen erfolgreich importiert. Seite wird neu geladen.');
                    window.location.reload();
                } else {
                    alert('Fehler beim Importieren.');
                }
            } catch (err) {
                console.error(err);
                alert('Ungültige Datei.');
            }
        };
        reader.readAsText(file);
    };

    if (isLocked) {
        return (
            <div className="flex flex-col items-center justify-center h-full space-y-6">
                <Lock className="w-16 h-16 text-slate-600" />
                <h2 className="text-2xl font-bold">Adminbereich gesperrt</h2>
                <div className="flex flex-col items-center space-y-4">
                    <input
                        type="password"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="PIN eingeben"
                        className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-2xl text-center w-48 focus:outline-none focus:border-blue-500"
                        maxLength={4}
                    />
                    {error && <div className="text-red-400">{error}</div>}
                    <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(num => (
                            <button
                                key={num}
                                onClick={() => setPin(p => p + num)}
                                className="w-16 h-16 bg-slate-800 rounded-lg text-xl font-bold hover:bg-slate-700 active:scale-95 transition"
                            >
                                {num}
                            </button>
                        ))}
                    </div>
                    <button
                        onClick={handleUnlock}
                        className="bg-blue-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-blue-500 transition w-full"
                    >
                        Entsperren
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-6 max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
                <h2 className="text-3xl font-bold text-white">Einstellungen</h2>
                <button
                    onClick={lock}
                    className="flex items-center space-x-2 bg-slate-800 px-4 py-2 rounded-lg hover:bg-slate-700 transition"
                >
                    <Lock className="w-4 h-4" />
                    <span>Sperren</span>
                </button>
            </div>

            {/* Tabs Navigation */}
            <div className="flex space-x-1 bg-slate-800/50 p-1 rounded-xl mb-6 overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                            }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            <div className="space-y-8 overflow-y-auto custom-scrollbar pr-2 pb-20">

                {/* 1. KALENDER TAB */}
                {activeTab === 'kalender' && (
                    <section className="bg-slate-800/30 p-6 rounded-xl border border-slate-700">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-semibold text-slate-300 flex items-center gap-2">
                                <CalendarIcon className="w-5 h-5" />
                                Google Calendar
                            </h3>
                            {isGoogleAuth ? (
                                <span className="flex items-center gap-1 text-green-400 text-sm font-medium bg-green-400/10 px-3 py-1 rounded-full">
                                    <CheckCircle className="w-4 h-4 ml-1" />
                                    Verbunden
                                </span>
                            ) : (
                                <a
                                    href={`${API_URL}/auth/google`}
                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-500 transition"
                                >
                                    Mit Google verbinden
                                </a>
                            )}
                        </div>

                        {isGoogleAuth && remoteCalendars.length > 0 && (
                            <div className="mt-4 space-y-4">
                                <div className="grid grid-cols-[auto_40px_1fr_auto] gap-4 items-center px-2 py-2 text-xs uppercase text-slate-500 font-bold border-b border-slate-700">
                                    <span>Aktiv</span>
                                    <span>Farbe</span>
                                    <span>Name (Alias)</span>
                                    <div className="flex space-x-2">
                                        <span title="Heute Widget">Heute</span>
                                        <span title="Wochen Widget">Woche</span>
                                        <span title="Nächstes Event">Next</span>
                                        <span title="Wochenansicht">View</span>
                                    </div>
                                </div>

                                {remoteCalendars.map(cal => {
                                    const isSelected = (config.google?.selectedCalendars || []).includes(cal.id);
                                    const settings = config.google?.calendarSettings?.[cal.id] || {
                                        id: cal.id,
                                        color: config.google?.calendarColors?.[cal.id] || '#3b82f6',
                                        alias: cal.summary,
                                        scopes: { today: true, weekWidget: true, nextEvent: true, weekView: true }
                                    };

                                    const updateSettings = (partial: Partial<typeof settings>) => {
                                        const newSettings = { ...settings, ...partial };
                                        const allSettings = { ...(config.google?.calendarSettings || {}), [cal.id]: newSettings };

                                        // Also update legacy structures for compat
                                        const newColors = { ...(config.google?.calendarColors || {}), [cal.id]: newSettings.color };

                                        updateConfig({
                                            google: {
                                                ...config.google,
                                                calendarColors: newColors,
                                                calendarSettings: allSettings,
                                                selectedCalendars: config.google?.selectedCalendars || []
                                            }
                                        });
                                    };

                                    const toggleScope = (scope: keyof typeof settings.scopes) => {
                                        updateSettings({
                                            scopes: { ...settings.scopes, [scope]: !settings.scopes[scope] }
                                        });
                                    };

                                    return (
                                        <div key={cal.id} className="grid grid-cols-[auto_40px_1fr_auto] gap-4 items-center p-3 bg-slate-900/40 rounded-lg border border-slate-700/50 hover:border-slate-600 transition">

                                            {/* 1. Active Checkbox */}
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => handleToggleGoogleCalendar(cal.id)}
                                                className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500"
                                            />

                                            {/* 2. Color Picker */}
                                            <input
                                                type="color"
                                                value={settings.color}
                                                onChange={(e) => updateSettings({ color: e.target.value })}
                                                className="w-8 h-8 rounded-full border-0 p-0 bg-transparent cursor-pointer"
                                                disabled={!isSelected}
                                            />

                                            {/* 3. Alias Input */}
                                            <input
                                                type="text"
                                                value={settings.alias}
                                                onChange={(e) => updateSettings({ alias: e.target.value })}
                                                placeholder={cal.summary}
                                                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 w-full disabled:opacity-50"
                                                disabled={!isSelected}
                                            />

                                            {/* 4. Scopes */}
                                            <div className="flex items-center space-x-3">
                                                {[
                                                    { key: 'today', label: 'H' },
                                                    { key: 'weekWidget', label: 'W' },
                                                    { key: 'nextEvent', label: 'N' },
                                                    { key: 'weekView', label: 'V' },
                                                ].map((s) => (
                                                    <button
                                                        key={s.key}
                                                        onClick={() => toggleScope(s.key as import('../../contexts/ConfigContext').CalendarScope)}
                                                        disabled={!isSelected}
                                                        className={`w-8 h-8 rounded text-xs font-bold transition-all ${settings.scopes[s.key as import('../../contexts/ConfigContext').CalendarScope]
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-slate-800 text-slate-500'
                                                            } ${!isSelected ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105'}`}
                                                        title={s.key}
                                                    >
                                                        {s.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {isGoogleAuth && remoteCalendars.length === 0 && (
                            <p className="text-slate-500 italic">Keine Kalender gefunden.</p>
                        )}

                        <div className="mt-6 border-t border-slate-700 pt-4">
                            <label className="block text-sm font-medium text-slate-400 mb-2">
                                Aktualisierungsrate (Cache)
                            </label>
                            <select
                                value={config.google?.pollInterval || 600000}
                                onChange={(e) => updateConfig({
                                    google: { ...config.google, pollInterval: parseInt(e.target.value) } as any
                                })}
                                className="bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value={60000}>1 Minute (Schnell)</option>
                                <option value={120000}>2 Minuten</option>
                                <option value={300000}>5 Minuten</option>
                                <option value={600000}>10 Minuten (Standard)</option>
                            </select>
                            <p className="text-xs text-slate-500 mt-1">
                                Wie oft sollen Termine von Google abgerufen werden.
                                <br />
                                Achtung: Zu häufige Updates können zu einer temporären Sperre durch Google führen.
                            </p>
                        </div>
                    </section>
                )}

                {/* 2. EXTERNE DATEN TAB (Camera & HA) */}
                {activeTab === 'extern' && (
                    <div className="space-y-8">
                        <section>
                            <h3 className="text-xl font-semibold text-slate-300 mb-4">Kamera Stream</h3>
                            <div className="bg-slate-900/40 rounded-lg border border-slate-700/50 p-4">
                                <label className="block text-sm font-medium text-slate-400 mb-2">
                                    RTSP / HTTP Stream URL
                                </label>
                                <input
                                    type="text"
                                    value={config.cameraUrl || ''}
                                    onChange={(e) => updateConfig({ cameraUrl: e.target.value })}
                                    placeholder="rtsp://user:pass@192.168.1.100:554/stream"
                                    className="bg-slate-800 border border-slate-700 rounded w-full px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                                />
                                <p className="text-xs text-slate-500 mt-2">
                                    Unterstützt RTSP Streams (werden via Backend transcodiert) oder direkte HTTP MJPEG Streams.
                                </p>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-xl font-semibold text-slate-300 mb-4">Home Assistant</h3>
                            <div className="bg-slate-900/40 rounded-lg border border-slate-700/50 p-4">
                                <label className="block text-sm font-medium text-slate-400 mb-2">
                                    Dashboard URL
                                </label>
                                <input
                                    type="text"
                                    value={config.haUrl || ''}
                                    onChange={(e) => updateConfig({ haUrl: e.target.value })}
                                    placeholder="http://homeassistant.local:8123/lovelace/dashboard"
                                    className="bg-slate-800 border border-slate-700 rounded w-full px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                                />
                                <p className="text-xs text-slate-500 mt-2">
                                    Diese URL wird auf der "Home" Seite als Vollbild (Iframe) angezeigt.
                                </p>
                            </div>
                        </section>
                    </div>
                )}

                {/* 3. ANSICHT TAB */}
                {activeTab === 'ansicht' && (
                    <div className="space-y-8">
                        <section>
                            <h3 className="text-xl font-semibold text-slate-300 mb-4">Wetter Standort</h3>
                            <input
                                type="text"
                                value={config.weatherLocation}
                                onChange={(e) => updateConfig({ weatherLocation: e.target.value })}
                                className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 w-full max-w-md focus:outline-none focus:border-blue-500"
                            />
                        </section>

                        <section>
                            <h3 className="text-xl font-semibold text-slate-300 mb-4">Anzeigeoptionen</h3>
                            <label className="flex items-center space-x-3">
                                <input
                                    type="checkbox"
                                    checked={config.showSeconds}
                                    onChange={(e) => updateConfig({ showSeconds: e.target.checked })}
                                    className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                                />
                                <span>Sekundenzeiger anzeigen</span>
                            </label>
                        </section>
                    </div>
                )}

                {/* 4. ZUGANGSDATEN TAB */}
                {activeTab === 'zugangsdaten' && (
                    <section>
                        <h3 className="text-xl font-semibold text-slate-300 mb-4">Edupage Zugangsdaten</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Benutzername / Email</label>
                                <input
                                    type="text"
                                    value={config.edupage?.username || ''}
                                    onChange={(e) => updateConfig({ edupage: { ...config.edupage, username: e.target.value } })}
                                    className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-400 mb-1">Passwort</label>
                                <input
                                    type="password"
                                    value={config.edupage?.password || ''}
                                    onChange={(e) => updateConfig({ edupage: { ...config.edupage, password: e.target.value } })}
                                    className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm text-slate-400 mb-1">Subdomain (Instanz)</label>
                                <div className="flex items-center">
                                    <span className="text-slate-500 mr-2">https://</span>
                                    <input
                                        type="text"
                                        value={config.edupage?.subdomain || 'login1'}
                                        onChange={(e) => updateConfig({ edupage: { ...config.edupage, subdomain: e.target.value } })}
                                        placeholder="login1"
                                        className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 flex-grow focus:outline-none focus:border-blue-500"
                                    />
                                    <span className="text-slate-500 ml-2">.edupage.org</span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">z.B. "myschool" oder leer lassen für Standard ("login1").</p>
                            </div>
                        </div>

                        <div className="mt-8 pt-8 border-t border-slate-700">
                            <h3 className="text-xl font-semibold text-slate-300 mb-4">Notion Integration</h3>
                            <div className="bg-slate-900/40 rounded-lg border border-slate-700/50 p-6 space-y-4">
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Notion Integration Token</label>
                                    <input
                                        type="password"
                                        value={config.notionKey || ''}
                                        onChange={(e) => updateConfig({ notionKey: e.target.value })}
                                        placeholder="secret_..."
                                        className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-blue-500 font-mono text-sm"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Erstellen Sie einen Token unter <a href="https://www.notion.so/my-integrations" target="_blank" className="text-blue-400 hover:underline">my-integrations</a>.</p>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Database ID</label>
                                    <input
                                        type="text"
                                        value={config.notionDatabaseId || ''}
                                        onChange={(e) => updateConfig({ notionDatabaseId: e.target.value })}
                                        placeholder="32-stellige ID aus der URL"
                                        className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-blue-500 font-mono text-sm"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Die ID der Datenbank, die Ihre Notizen enthält.</p>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-400 mb-1">Aktualisierungsintervall (Minuten)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="60"
                                        value={config.notionRefreshInterval || 5}
                                        onChange={(e) => updateConfig({ notionRefreshInterval: parseInt(e.target.value) || 5 })}
                                        className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-blue-500 w-24"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">Wie oft sollen neue Notizen geladen werden?</p>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* 5. DATENSICHERUNG TAB */}
                {activeTab === 'backup' && (
                    <section>
                        <h3 className="text-xl font-semibold text-slate-300 mb-4">Backup & Wiederherstellung</h3>
                        {/* ... backup content ... */}
                        <div className="bg-slate-900/40 rounded-lg border border-slate-700/50 p-6 space-y-6">
                            <div>
                                <h4 className="font-bold text-slate-200 mb-2">Exportieren</h4>
                                <p className="text-sm text-slate-500 mb-3">Lade die aktuelle Konfiguration als JSON-Datei herunter.</p>
                                <button
                                    onClick={handleExport}
                                    className="flex items-center space-x-2 bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg hover:bg-slate-700 transition"
                                >
                                    <Download className="w-5 h-5 text-blue-400" />
                                    <span>Einstellungen exportieren</span>
                                </button>
                            </div>

                            <div className="border-t border-slate-700/50 pt-6">
                                <h4 className="font-bold text-slate-200 mb-2">Importieren</h4>
                                <p className="text-sm text-slate-500 mb-3">Stellen Sie eine zuvor gesicherte Konfiguration wieder her.</p>
                                <label className="flex items-center space-x-2 bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg hover:bg-slate-700 transition cursor-pointer w-fit">
                                    <Upload className="w-5 h-5 text-green-400" />
                                    <span>Einstellungen importieren</span>
                                    <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                                </label>
                            </div>
                        </div>
                    </section>
                )}

                {/* 6. GERÄTE TAB (Security) */}
                {activeTab === 'geraete' && (
                    <DeviceList />
                )}
            </div>

            <div className="mt-auto pt-8 flex justify-end">
                <div className="flex items-center space-x-2 text-green-400">
                    <Save className="w-5 h-5" />
                    <span>Einstellungen automatisch gespeichert</span>
                </div>
            </div>
        </div>
    );
};

export default AdminSettings;
