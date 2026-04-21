import React, { useState, useEffect } from 'react';
import { useKiosk } from '../../contexts/KioskContext';
import { useConfig } from '../../contexts/ConfigContext';
import { useSecurity } from '../../contexts/SecurityContext';
import { Lock, Save, Calendar as CalendarIcon, CheckCircle, Upload, Download, Smartphone, Trash2, Shield, ShieldAlert, ClipboardCheck, Plus, Cake, RefreshCw, Server, GitBranch, Database, Keyboard, Trophy, Star, Image, Cat, StickyNote, X } from 'lucide-react';
import { IconMap, ChoreIcon } from '../../components/ChoreIcon';
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
            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Geräte verwalten</h3>
            <div className="space-y-3">
                {devices.map(d => (
                    <div key={d.id} className={`flex items-center justify-between p-4 rounded-lg border ${d.status === 'approved' ? 'bg-white/40 dark:bg-slate-900/40 border-green-900/30' : 'bg-slate-200 dark:bg-slate-800 border-yellow-900/30'}`}>
                        <div className="flex items-center space-x-3">
                            {d.status === 'approved' ? <Shield className="text-green-500 w-6 h-6" /> : <ShieldAlert className="text-yellow-500 w-6 h-6" />}
                            <div>
                                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    {d.name}
                                    {d.id === deviceId && <span className="text-xs bg-blue-600 px-2 py-0.5 rounded-full">Aktuelles Gerät</span>}
                                </div>
                                <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">{d.ip} • {new Date(d.lastSeen).toLocaleString()}</div>
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <button
                                onClick={() => toggleStatus(d.id, d.status)}
                                className={`px-3 py-1.5 rounded text-sm font-bold transition ${d.status === 'approved' ? 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-red-900/20 hover:text-red-400' : 'bg-green-600 text-white hover:bg-green-500'}`}
                            >
                                {d.status === 'approved' ? 'Sperren' : 'Freigeben'}
                            </button>
                            <button
                                onClick={() => deleteDevice(d.id)}
                                className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-500 transition"
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
    const { deviceId } = useSecurity();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [remoteCalendars, setRemoteCalendars] = useState<any[]>([]);
    const [isGoogleAuth, setIsGoogleAuth] = useState(false);
    const [activeTab, setActiveTab] = useState('kalender');
    const [newTaskIcon, setNewTaskIcon] = useState('clean');
    const [newTaskDifficulty, setNewTaskDifficulty] = useState<1 | 2 | 3>(1);
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [isKeyboardActive, setKeyboardActive] = useState(false);
    const [bonusKidId, setBonusKidId] = useState('');
    const [bonusStars, setBonusStars] = useState(1);
    const [bonusReason, setBonusReason] = useState('');
    const [bonusSending, setBonusSending] = useState(false);
    const [bonusSuccess, setBonusSuccess] = useState('');

    // Auto-disable keyboard on lock
    useEffect(() => {
        if (isLocked && isKeyboardActive) {
            fetch(`${getApiUrl()}/api/system/keyboard`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({ active: false })
            }).then(() => setKeyboardActive(false));
        }
    }, [isLocked, isKeyboardActive, deviceId]);

    const toggleKeyboard = async () => {
        const newState = !isKeyboardActive;
        try {
            await fetch(`${getApiUrl()}/api/system/keyboard`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({ active: newState })
            });
            setKeyboardActive(newState);
        } catch (e) {
            console.error("Failed to toggle keyboard");
        }
    };

    const tabs = [
        { id: 'kalender', label: 'Kalender', icon: CalendarIcon },
        { id: 'aufgaben', label: 'Aufgaben', icon: ClipboardCheck },
        { id: 'belohnungen', label: 'Belohnungen', icon: Trophy },
        { id: 'katze', label: 'Katze & Notiz', icon: Cat },
        { id: 'zugangsdaten', label: 'Zugangsdaten', icon: Lock },
        { id: 'ansicht', label: 'Ansicht', icon: CheckCircle }, // Reusing CheckCircle as generic icon for View
        { id: 'extern', label: 'Externe Daten', icon: Upload }, // Reusing Upload/Download/Server equivalent
        { id: 'backup', label: 'Datensicherung', icon: Save },
        { id: 'wartung', label: 'Wartung', icon: Server },
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
        fetch(`${API_URL}/api/google/calendars`, {
            headers: { 'x-device-id': deviceId }
        })
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
    }, [deviceId]);

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

    const handleExport = async () => {
        try {
            const res = await fetch(`${API_URL}/api/config/backup`, {
                headers: { 'x-device-id': deviceId }
            });

            if (!res.ok) throw new Error('Backup failed');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `homedashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (e) {
            console.error(e);
            alert('Fehler beim Exportieren der Einstellungen.');
        }
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
                    headers: {
                        'Content-Type': 'application/json',
                        'x-device-id': deviceId
                    },
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

    const handleRefresh = () => {
        window.location.reload();
    };

    const handleReloadContent = async () => {
        try {
            await fetch(`${API_URL}/api/system/clearcache`, { method: 'POST', headers: { 'x-device-id': deviceId } });
            // Small delay to ensure server processed it
            setTimeout(() => {
                window.location.reload();
            }, 500);
        } catch (e) {
            alert('Fehler beim Leeren des Caches');
        }
    };

    const handleSystemUpdate = async () => {
        if (!confirm("System aktualisieren (Git Pull)?")) return;
        try {
            const res = await fetch(`${API_URL}/api/system/update`, { method: 'POST', headers: { 'x-device-id': deviceId } });
            const data = await res.json();

            if (data.success) {
                const msg = data.note
                    ? `Update erfolgreich!\n${data.output}\n\nHinweis: ${data.note}`
                    : `Update erfolgreich!\n${data.output}`;
                alert(msg);
                window.location.reload();
            } else {
                alert(`Update fehlgeschlagen:\n${data.details}\n\nOutput:\n${data.output}`);
            }
        } catch (e) {
            alert('Fehler beim Verbinden zum Server für Update.');
        }
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
                        className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-3 text-2xl text-center w-48 focus:outline-none focus:border-blue-500"
                        maxLength={6}
                    />
                    {error && <div className="text-red-400">{error}</div>}
                    <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(num => (
                            <button
                                key={num}
                                onClick={() => setPin(p => p + num)}
                                className="w-16 h-16 bg-slate-200 dark:bg-slate-800 rounded-lg text-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-700 active:scale-95 transition"
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
        <div className="h-full flex flex-col p-6 w-full">
            <div className="flex justify-between items-center mb-6 border-b border-slate-300 dark:border-slate-700 pb-4">
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Einstellungen</h2>
                <button
                    onClick={lock}
                    className="flex items-center space-x-2 bg-slate-200 dark:bg-slate-800 px-4 py-2 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                >
                    <Lock className="w-4 h-4" />
                    <span>Sperren</span>
                </button>
            </div>

            {/* Tabs Navigation */}
            <div className="flex flex-wrap gap-2 bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-xl mb-6">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === tab.id
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-300/50 dark:hover:bg-slate-700/50'
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
                    <section className="bg-slate-200/30 dark:bg-slate-800/30 p-6 rounded-xl border border-slate-300 dark:border-slate-700">
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-2">
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
                                <div className="grid grid-cols-[auto_40px_1fr_40px_auto] gap-4 items-center px-2 py-2 text-xs uppercase text-slate-400 dark:text-slate-500 font-bold border-b border-slate-300 dark:border-slate-700">
                                    <span>Aktiv</span>
                                    <span>Farbe</span>
                                    <span>Name (Alias)</span>
                                    <span title="Geburtstag"><Cake className="w-4 h-4" /></span>
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
                                        isBirthday: false,
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
                                        <div key={cal.id} className="grid grid-cols-[auto_40px_1fr_40px_auto] gap-4 items-center p-3 bg-white/40 dark:bg-slate-900/40 rounded-lg border border-slate-300/50 dark:border-slate-700/50 hover:border-slate-400 dark:hover:border-slate-600 transition">

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
                                                className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 w-full disabled:opacity-50"
                                                disabled={!isSelected}
                                            />

                                            {/* 3b. Is Birthday Toggle */}
                                            <div className="flex items-center justify-center" title="Ist Geburtstagskalender?">
                                                <button
                                                    onClick={() => updateSettings({ isBirthday: !settings.isBirthday })}
                                                    disabled={!isSelected}
                                                    className={`p-1.5 rounded transition ${settings.isBirthday ? 'text-pink-400 bg-pink-400/10' : 'text-slate-600 hover:text-slate-400'}`}
                                                >
                                                    <Cake className="w-5 h-5" />
                                                </button>
                                            </div>

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
                                                            : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
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
                            <p className="text-slate-400 dark:text-slate-500 italic">Keine Kalender gefunden.</p>
                        )}

                        <div className="mt-6 border-t border-slate-300 dark:border-slate-700 pt-4">
                            <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
                                Aktualisierungsrate (Cache)
                            </label>
                            <select
                                value={config.google?.pollInterval || 600000}
                                onChange={(e) => updateConfig({
                                    google: { ...config.google, pollInterval: parseInt(e.target.value) } as any
                                })}
                                className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value={60000}>1 Minute (Schnell)</option>
                                <option value={120000}>2 Minuten</option>
                                <option value={300000}>5 Minuten</option>
                                <option value={600000}>10 Minuten (Standard)</option>
                            </select>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
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
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Kamera Stream</h3>
                            <div className="bg-white/40 dark:bg-slate-900/40 rounded-lg border border-slate-300/50 dark:border-slate-700/50 p-4">
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
                                    RTSP / HTTP Stream URL
                                </label>
                                <input
                                    type="text"
                                    value={config.cameraUrl || ''}
                                    onChange={(e) => updateConfig({ cameraUrl: e.target.value })}
                                    placeholder="rtsp://user:pass@192.168.1.100:554/stream"
                                    className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded w-full px-3 py-2 text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                                />
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                                    Unterstützt RTSP Streams (werden via Backend transcodiert) oder direkte HTTP MJPEG Streams.
                                </p>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Home Assistant</h3>
                            <div className="bg-white/40 dark:bg-slate-900/40 rounded-lg border border-slate-300/50 dark:border-slate-700/50 p-4">
                                <label className="block text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
                                    Dashboard URL
                                </label>
                                <input
                                    type="text"
                                    value={config.haUrl || ''}
                                    onChange={(e) => updateConfig({ haUrl: e.target.value })}
                                    placeholder="http://homeassistant.local:8123/lovelace/dashboard"
                                    className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded w-full px-3 py-2 text-slate-900 dark:text-white placeholder-slate-600 focus:outline-none focus:border-blue-500"
                                />
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
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
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Wetter Standort</h3>
                            <input
                                type="text"
                                value={config.weatherLocation}
                                onChange={(e) => updateConfig({ weatherLocation: e.target.value })}
                                className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 w-full max-w-md focus:outline-none focus:border-blue-500"
                            />
                        </section>

                        <section>
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Weihnachtsmannroute</h3>
                            <div className="space-y-4">
                                <label className="flex items-center space-x-3">
                                    <input
                                        type="checkbox"
                                        checked={config.santaRouteEnabled}
                                        onChange={(e) => updateConfig({ santaRouteEnabled: e.target.checked })}
                                        className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                                    />
                                    <span>Aktiviere Weihnachtsmannroute</span>
                                </label>

                                {config.santaRouteEnabled && (
                                    <div className="pl-8">
                                        <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">
                                            Tracker Adresse (Fallback: noradsanta.org)
                                        </label>
                                        <input
                                            type="text"
                                            value={config.santaRouteAddress || ''}
                                            onChange={(e) => updateConfig({ santaRouteAddress: e.target.value })}
                                            placeholder="https://www.noradsanta.org/en/map"
                                            className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 w-full max-w-md focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                )}
                            </div>
                        </section>

                        <section>
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Anzeigeoptionen</h3>
                            <div className="space-y-4">
                                <label className="flex items-center space-x-3">
                                    <input
                                        type="checkbox"
                                        checked={config.showSeconds}
                                        onChange={(e) => updateConfig({ showSeconds: e.target.checked })}
                                        className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                                    />
                                    <span>Sekundenzeiger anzeigen</span>
                                </label>
                            </div>
                        </section>

                        <section>
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Wetter Warnungen (DWD)</h3>
                            <div className="bg-white/40 dark:bg-slate-900/40 rounded-lg border border-slate-300/50 dark:border-slate-700/50 p-4">
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                                    Wählen Sie aus, welche Warnmeldungen <strong>ignoriert</strong> werden sollen. Aktive Buttons bedeuten, dass diese Warnung <strong>nicht</strong> angezeigt wird.
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { id: 'frost', label: 'Frost' },
                                        { id: 'ice', label: 'Glätte / Eis' },
                                        { id: 'fog', label: 'Nebel' },
                                        { id: 'wind', label: 'Wind / Sturm' },
                                        { id: 'rain', label: 'Regen' },
                                        { id: 'snow', label: 'Schnee' },
                                        { id: 'thunderstorm', label: 'Gewitter' },
                                        { id: 'heat', label: 'Hitze' },
                                        { id: 'uv', label: 'UV-Strahlung' },
                                    ].map(type => {
                                        const isExcluded = (config.weatherAlertExclusions || []).includes(type.id);
                                        return (
                                            <button
                                                key={type.id}
                                                onClick={() => {
                                                    const current = config.weatherAlertExclusions || [];
                                                    const newExclusions = current.includes(type.id)
                                                        ? current.filter(id => id !== type.id)
                                                        : [...current, type.id];
                                                    updateConfig({ weatherAlertExclusions: newExclusions });
                                                }}
                                                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition flex items-center gap-2 ${isExcluded
                                                    ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
                                                    }`}
                                            >
                                                {isExcluded ? <ShieldAlert className="w-4 h-4" /> : <Shield className="w-4 h-4 text-slate-600" />}
                                                {type.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>

                        <section className="bg-white/40 dark:bg-slate-900/40 rounded-lg border border-slate-300/50 dark:border-slate-700/50 p-4">
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Bildschirmschoner (Nachtmodus)</h3>
                            <div className="space-y-4">
                                <label className="flex items-center space-x-3">
                                    <input
                                        type="checkbox"
                                        checked={config.screensaver?.enabled}
                                        onChange={(e) => updateConfig({ screensaver: { ...(config.screensaver || { start: '22:00', end: '06:00' }), enabled: e.target.checked } as any })}
                                        className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                                    />
                                    <span>Aktivieren (3 Min. Inaktivität)</span>
                                </label>

                                {config.screensaver?.enabled && (
                                    <div className="grid grid-cols-2 gap-4 pl-8">
                                        <div>
                                            <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Startzeit</label>
                                            <input
                                                type="time"
                                                value={config.screensaver.start}
                                                onChange={(e) => updateConfig({ screensaver: { ...config.screensaver!, start: e.target.value } })}
                                                className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 w-full"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Endzeit</label>
                                            <input
                                                type="time"
                                                value={config.screensaver.end}
                                                onChange={(e) => updateConfig({ screensaver: { ...config.screensaver!, end: e.target.value } })}
                                                className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 w-full"
                                            />
                                        </div>
                                        <p className="col-span-2 text-xs text-slate-400 dark:text-slate-500">
                                            Der Bildschirmschoner wird nur in diesem Zeitraum bei Inaktivität aktiviert.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="bg-white/40 dark:bg-slate-900/40 rounded-lg border border-slate-300/50 dark:border-slate-700/50 p-4">
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Bildschirmschoner (Tagsüber – iCloud Album)</h3>
                            <div className="space-y-4">
                                <label className="flex items-center space-x-3">
                                    <input
                                        type="checkbox"
                                        checked={!!config.screensaver?.photoEnabled}
                                        onChange={(e) => updateConfig({
                                            screensaver: {
                                                ...(config.screensaver || { enabled: false, start: '22:00', end: '06:00' }),
                                                photoEnabled: e.target.checked
                                            } as any
                                        })}
                                        className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                                    />
                                    <span>Foto-Diashow außerhalb des Nacht-Zeitraums aktivieren</span>
                                </label>

                                {config.screensaver?.photoEnabled && (
                                    <div className="grid grid-cols-2 gap-4 pl-8">
                                        <div className="col-span-2">
                                            <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">
                                                iCloud Freigabe-Link
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="https://share.icloud.com/photos/0..."
                                                value={config.screensaver?.photoAlbumUrl || ''}
                                                onChange={(e) => updateConfig({
                                                    screensaver: { ...config.screensaver!, photoAlbumUrl: e.target.value }
                                                })}
                                                className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 w-full"
                                            />
                                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                                                Ein in der Fotos-App freigegebenes Album. Der Link beginnt mit <code>https://share.icloud.com/photos/</code>.
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Inaktivität (Minuten)</label>
                                            <input
                                                type="number"
                                                min={1}
                                                max={120}
                                                value={config.screensaver?.photoIdleMinutes ?? 5}
                                                onChange={(e) => updateConfig({
                                                    screensaver: { ...config.screensaver!, photoIdleMinutes: Math.max(1, parseInt(e.target.value || '5', 10)) }
                                                })}
                                                className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 w-full"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Bildwechsel (Sekunden)</label>
                                            <input
                                                type="number"
                                                min={3}
                                                max={300}
                                                value={config.screensaver?.photoIntervalSeconds ?? 10}
                                                onChange={(e) => updateConfig({
                                                    screensaver: { ...config.screensaver!, photoIntervalSeconds: Math.max(3, parseInt(e.target.value || '10', 10)) }
                                                })}
                                                className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 w-full"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Übergangseffekt</label>
                                            <select
                                                value={config.screensaver?.photoTransition ?? 'random'}
                                                onChange={(e) => updateConfig({
                                                    screensaver: { ...config.screensaver!, photoTransition: e.target.value as any }
                                                })}
                                                className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 w-full"
                                            >
                                                <option value="random">Zufall</option>
                                                <option value="crossfade">Überblenden</option>
                                                <option value="slide">Hereingleiten</option>
                                                <option value="push">Schieben</option>
                                                <option value="zoom">Zoom</option>
                                                <option value="flip">3D-Kippen</option>
                                                <option value="blur">Weichzeichner</option>
                                            </select>
                                        </div>
                                        <p className="col-span-2 text-xs text-slate-400 dark:text-slate-500">
                                            Die Diashow startet außerhalb des Nacht-Zeitraums nach der oben angegebenen Inaktivität. Im Nacht-Zeitraum wird stattdessen der schwarze Uhr-Bildschirmschoner verwendet.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                )}

                {/* 4. ZUGANGSDATEN TAB */}
                {activeTab === 'zugangsdaten' && (
                    <section>
                        <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Edupage Zugangsdaten</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Benutzername / Email</label>
                                <input
                                    type="text"
                                    value={config.edupage?.username || ''}
                                    onChange={(e) => updateConfig({ edupage: { ...config.edupage, username: e.target.value } })}
                                    className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Passwort</label>
                                <input
                                    type="password"
                                    value={config.edupage?.password || ''}
                                    onChange={(e) => updateConfig({ edupage: { ...config.edupage, password: e.target.value } })}
                                    className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Subdomain (Instanz)</label>
                                <div className="flex items-center">
                                    <span className="text-slate-400 dark:text-slate-500 mr-2">https://</span>
                                    <input
                                        type="text"
                                        value={config.edupage?.subdomain || 'login1'}
                                        onChange={(e) => updateConfig({ edupage: { ...config.edupage, subdomain: e.target.value } })}
                                        placeholder="login1"
                                        className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 flex-grow focus:outline-none focus:border-blue-500"
                                    />
                                    <span className="text-slate-400 dark:text-slate-500 ml-2">.edupage.org</span>
                                </div>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">z.B. "myschool" oder leer lassen für Standard ("login1").</p>
                            </div>
                        </div>

                        <div className="mt-8 pt-8 border-t border-slate-300 dark:border-slate-700">
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Notion Integration</h3>
                            <div className="bg-white/40 dark:bg-slate-900/40 rounded-lg border border-slate-300/50 dark:border-slate-700/50 p-6 space-y-4">
                                <div>
                                    <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Notion Integration Token</label>
                                    <input
                                        type="password"
                                        value={config.notionKey || ''}
                                        onChange={(e) => updateConfig({ notionKey: e.target.value })}
                                        placeholder="secret_..."
                                        className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-blue-500 font-mono text-sm"
                                    />
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Erstellen Sie einen Token unter <a href="https://www.notion.so/my-integrations" target="_blank" className="text-blue-400 hover:underline">my-integrations</a>.</p>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Database ID</label>
                                    <input
                                        type="text"
                                        value={config.notionDatabaseId || ''}
                                        onChange={(e) => updateConfig({ notionDatabaseId: e.target.value })}
                                        placeholder="32-stellige ID aus der URL"
                                        className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-blue-500 font-mono text-sm"
                                    />
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Die ID der Datenbank, die Ihre Notizen enthält.</p>
                                </div>
                                <div>
                                    <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Aktualisierungsintervall (Minuten)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="60"
                                        value={config.notionRefreshInterval || 5}
                                        onChange={(e) => updateConfig({ notionRefreshInterval: parseInt(e.target.value) || 5 })}
                                        className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-blue-500 w-24"
                                    />
                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Wie oft sollen neue Notizen geladen werden?</p>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* 5. DATENSICHERUNG TAB */}
                {activeTab === 'backup' && (
                    <section>
                        <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Backup & Wiederherstellung</h3>
                        {/* ... backup content ... */}
                        <div className="bg-white/40 dark:bg-slate-900/40 rounded-lg border border-slate-300/50 dark:border-slate-700/50 p-6 space-y-6">
                            <div>
                                <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">Exportieren</h4>
                                <p className="text-sm text-slate-400 dark:text-slate-500 mb-3">Lade die aktuelle Konfiguration als JSON-Datei herunter.</p>
                                <button
                                    onClick={handleExport}
                                    className="flex items-center space-x-2 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-4 py-2 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                                >
                                    <Download className="w-5 h-5 text-blue-400" />
                                    <span>Einstellungen exportieren</span>
                                </button>
                            </div>

                            <div className="border-t border-slate-300/50 dark:border-slate-700/50 pt-6">
                                <h4 className="font-bold text-slate-700 dark:text-slate-200 mb-2">Importieren</h4>
                                <p className="text-sm text-slate-400 dark:text-slate-500 mb-3">Stellen Sie eine zuvor gesicherte Konfiguration wieder her.</p>
                                <label className="flex items-center space-x-2 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-4 py-2 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition cursor-pointer w-fit">
                                    <Upload className="w-5 h-5 text-green-400" />
                                    <span>Einstellungen importieren</span>
                                    <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                                </label>
                            </div>
                        </div>
                    </section>
                )}

                {/* 6. WARTUNG TAB */}
                {activeTab === 'wartung' && (
                    <div className="space-y-6">
                        <section>
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                                <Server className="w-6 h-6" /> System Wartung
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* 1. Page Refresh */}
                                <div className="bg-white/40 dark:bg-slate-900/40 p-6 rounded-xl border border-slate-300/50 dark:border-slate-700/50 flex flex-col items-start hover:border-blue-500/50 transition">
                                    <div className="bg-blue-500/20 p-3 rounded-lg text-blue-400 mb-4">
                                        <RefreshCw className="w-8 h-8" />
                                    </div>
                                    <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Seite aktualisieren</h4>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 flex-grow">
                                        Lädt die aktuelle Seite im Browser neu. Behebt meistens Darstellungsfehler.
                                    </p>
                                    <button
                                        onClick={handleRefresh}
                                        className="w-full py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-medium transition border border-slate-400 dark:border-slate-600"
                                    >
                                        Neu laden
                                    </button>
                                </div>

                                {/* 1b. Keyboard Toggle */}
                                <div className={`p-6 rounded-xl border flex flex-col items-start transition ${isKeyboardActive ? 'bg-blue-900/40 border-blue-500/50' : 'bg-white/40 dark:bg-slate-900/40 border-slate-300/50 dark:border-slate-700/50 hover:border-blue-500/50'}`}>
                                    <div className={`p-3 rounded-lg mb-4 ${isKeyboardActive ? 'bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                                        <Keyboard className="w-8 h-8" />
                                    </div>
                                    <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Bildschirmtastatur</h4>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 flex-grow">
                                        Aktiviert eine virtuelle Tastatur auf allen Dashboards. Wird beim Sperren automatisch deaktiviert.
                                    </p>
                                    <button
                                        onClick={toggleKeyboard}
                                        className={`w-full py-2 rounded-lg font-bold transition ${isKeyboardActive ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white border border-slate-400 dark:border-slate-600'}`}
                                    >
                                        {isKeyboardActive ? 'Deaktivieren' : 'Aktivieren'}
                                    </button>
                                </div>

                                {/* 2. Reload Content */}
                                <div className="bg-white/40 dark:bg-slate-900/40 p-6 rounded-xl border border-slate-300/50 dark:border-slate-700/50 flex flex-col items-start hover:border-yellow-500/50 transition">
                                    <div className="bg-yellow-500/20 p-3 rounded-lg text-yellow-400 mb-4">
                                        <Database className="w-8 h-8" />
                                    </div>
                                    <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Inhalte neuziehen</h4>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 flex-grow">
                                        Leert den Server-Cache (Google, Notion) und lädt die Seite neu, um frische Daten zu erzwingen.
                                    </p>
                                    <button
                                        onClick={handleReloadContent}
                                        className="w-full py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-medium transition border border-slate-400 dark:border-slate-600"
                                    >
                                        Cache leeren & Laden
                                    </button>
                                </div>

                                {/* 3. Git Pull */}
                                <div className="bg-white/40 dark:bg-slate-900/40 p-6 rounded-xl border border-slate-300/50 dark:border-slate-700/50 flex flex-col items-start hover:border-green-500/50 transition">
                                    <div className="bg-green-500/20 p-3 rounded-lg text-green-400 mb-4">
                                        <GitBranch className="w-8 h-8" />
                                    </div>
                                    <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">System Update</h4>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 flex-grow">
                                        Führt `git pull` aus, um die neueste Version vom Server zu laden und startet neu.
                                    </p>
                                    <button
                                        onClick={handleSystemUpdate}
                                        className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold transition shadow-lg shadow-green-900/20"
                                    >
                                        Update starten
                                    </button>
                                </div>

                                {/* 4. Album Cache Reset */}
                                <div className="bg-white/40 dark:bg-slate-900/40 p-6 rounded-xl border border-slate-300/50 dark:border-slate-700/50 flex flex-col items-start hover:border-purple-500/50 transition">
                                    <div className="bg-purple-500/20 p-3 rounded-lg text-purple-400 mb-4">
                                        <Image className="w-8 h-8" />
                                    </div>
                                    <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Album-Cache leeren</h4>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 flex-grow">
                                        Leert den Server-Cache der iCloud-Album-Fotos. Beim nächsten Screensaver-Start werden frische Bilder geladen.
                                    </p>
                                    <button
                                        onClick={async () => {
                                            try {
                                                const res = await fetch(`${getApiUrl()}/api/icloud/album/refresh`, {
                                                    method: 'POST',
                                                    headers: { 'x-device-id': deviceId }
                                                });
                                                if (res.ok) {
                                                    alert('Album-Cache wurde geleert.');
                                                } else {
                                                    alert('Fehler beim Leeren des Caches.');
                                                }
                                            } catch {
                                                alert('Server nicht erreichbar.');
                                            }
                                        }}
                                        className="w-full py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white rounded-lg font-medium transition border border-slate-400 dark:border-slate-600"
                                    >
                                        Cache leeren
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* Design / Theme Section */}
                        <section>
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                                Design
                            </h3>
                            <div className="bg-white/40 dark:bg-slate-900/40 rounded-xl border border-slate-300/50 dark:border-slate-700/50 p-5 space-y-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-600 dark:text-slate-400 mb-2">Farbmodus</label>
                                    <div className="flex gap-2">
                                        {(['dark', 'light', 'auto'] as const).map(mode => (
                                            <button
                                                key={mode}
                                                onClick={() => updateConfig({ theme: mode })}
                                                className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition ${
                                                    config.theme === mode
                                                        ? 'bg-blue-600 text-white shadow-lg'
                                                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600'
                                                }`}
                                            >
                                                {mode === 'dark' ? 'Dunkel' : mode === 'light' ? 'Hell' : 'Automatisch'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {config.theme === 'auto' && (
                                    <div className="bg-slate-100 dark:bg-slate-800/60 rounded-lg p-4 border border-slate-300 dark:border-slate-700 space-y-3">
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Im Auto-Modus wechselt das Design nach Uhrzeit zwischen Hell und Dunkel.
                                        </p>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Dunkel ab</label>
                                                <input
                                                    type="time"
                                                    value={config.themeSchedule?.darkStart || '20:00'}
                                                    onChange={(e) => updateConfig({
                                                        themeSchedule: {
                                                            ...config.themeSchedule || { darkStart: '20:00', darkEnd: '07:00' },
                                                            darkStart: e.target.value
                                                        }
                                                    })}
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Hell ab</label>
                                                <input
                                                    type="time"
                                                    value={config.themeSchedule?.darkEnd || '07:00'}
                                                    onChange={(e) => updateConfig({
                                                        themeSchedule: {
                                                            ...config.themeSchedule || { darkStart: '20:00', darkEnd: '07:00' },
                                                            darkEnd: e.target.value
                                                        }
                                                    })}
                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                )
                }

                {/* 7. AUFGABEN TAB */}
                {
                    activeTab === 'aufgaben' && (
                        <div className="space-y-8">
                            {/* KIDS MANAGEMENT */}
                            <section>
                                <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Kinder verwalten</h3>
                                <div className="bg-white/40 dark:bg-slate-900/40 rounded-xl border border-slate-300/50 dark:border-slate-700/50 p-4 space-y-4">
                                    <div className="space-y-2">
                                        {(config.chores?.kids || []).map((kid) => (
                                            <div key={kid.id} className="flex items-center justify-between bg-slate-200 dark:bg-slate-800 p-3 rounded-lg border border-slate-300 dark:border-slate-700">
                                                <div className="flex items-center space-x-3">
                                                    <div className="w-8 h-8 rounded-full border-2 border-slate-400 dark:border-slate-600" style={{ backgroundColor: kid.color }}></div>
                                                    <span className="font-bold text-slate-900 dark:text-white">{kid.name}</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const newKids = config.chores?.kids.filter(k => k.id !== kid.id) || [];
                                                        updateConfig({ chores: { ...config.chores!, kids: newKids } });
                                                    }}
                                                    className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-400 transition"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                        {(!config.chores?.kids || config.chores.kids.length === 0) && (
                                            <p className="text-slate-400 dark:text-slate-500 italic text-sm">Keine Kinder angelegt.</p>
                                        )}
                                    </div>

                                    <div className="border-t border-slate-300 dark:border-slate-700 pt-4 mt-4">
                                        <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">Kind hinzufügen</h4>
                                        <form
                                            className="flex gap-2"
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                const form = e.target as HTMLFormElement;
                                                const name = (form.elements.namedItem('name') as HTMLInputElement).value;
                                                const color = (form.elements.namedItem('color') as HTMLInputElement).value;
                                                if (!name) return;

                                                const newKid = {
                                                    id: Date.now().toString(),
                                                    name,
                                                    color
                                                };
                                                const newKids = [...(config.chores?.kids || []), newKid];
                                                updateConfig({ chores: { ...(config.chores || { tasks: [], settings: { interval: 'weekly' } }), kids: newKids } as any });
                                                form.reset();
                                            }}
                                        >
                                            <input
                                                type="text"
                                                name="name"
                                                placeholder="Name"
                                                className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 flex-1"
                                                required
                                            />
                                            <input
                                                type="color"
                                                name="color"
                                                defaultValue="#3b82f6"
                                                className="h-10 w-10 bg-transparent border-0 cursor-pointer rounded"
                                            />
                                            <button
                                                type="submit"
                                                className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-500 flex items-center"
                                            >
                                                <Plus className="w-5 h-5" />
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </section>

                            {/* TASKS MANAGEMENT */}
                            <section>
                                <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Aufgaben (Chore Loop)</h3>
                                <div className="bg-white/40 dark:bg-slate-900/40 rounded-xl border border-slate-300/50 dark:border-slate-700/50 p-4 space-y-4">
                                    <div className="space-y-2">
                                        {(config.chores?.tasks || []).map((task) => {
                                            const isEditing = editingTaskId === task.id;
                                            const updateTask = (updates: Partial<typeof task>) => {
                                                const newTasks = config.chores?.tasks.map(t => t.id === task.id ? { ...t, ...updates } : t) || [];
                                                updateConfig({ chores: { ...config.chores!, tasks: newTasks } });
                                            };

                                            return (
                                                <div key={task.id} className={`bg-slate-200 dark:bg-slate-800 rounded-lg border transition-all ${isEditing ? 'border-blue-500 dark:border-blue-400 ring-1 ring-blue-500/20' : 'border-slate-300 dark:border-slate-700'}`}>
                                                    {/* Compact row */}
                                                    <div className="flex items-center justify-between p-3">
                                                        <div
                                                            className="flex items-center space-x-3 flex-1 cursor-pointer min-w-0"
                                                            onClick={() => setEditingTaskId(isEditing ? null : task.id)}
                                                        >
                                                            <div className="bg-slate-300 dark:bg-slate-700 p-2 rounded text-slate-600 dark:text-slate-300 flex-shrink-0">
                                                                <ChoreIcon icon={task.icon} className="w-5 h-5" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="font-bold text-slate-900 dark:text-white truncate">{task.label}</div>
                                                                {task.description && <div className="text-xs text-slate-500 dark:text-slate-400 italic truncate">{task.description}</div>}
                                                                <div className="text-xs text-slate-400 dark:text-slate-500">
                                                                    Intervall: {task.rotation}
                                                                    <span className="ml-2 text-yellow-400">{'★'.repeat(task.difficulty || 1)}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <select
                                                            value={task.assignedTo || ''}
                                                            onChange={(e) => updateTask({ assignedTo: e.target.value || undefined })}
                                                            className="bg-white dark:bg-slate-900 border border-slate-400 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm rounded px-2 py-1 mx-4 focus:outline-none focus:border-blue-500"
                                                        >
                                                            <option value="">-- Nicht zugewiesen --</option>
                                                            {(config.chores?.kids || []).map(k => (
                                                                <option key={k.id} value={k.id}>{k.name}</option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            onClick={() => {
                                                                const newTasks = config.chores?.tasks.filter(t => t.id !== task.id) || [];
                                                                updateConfig({ chores: { ...config.chores!, tasks: newTasks } });
                                                                if (isEditing) setEditingTaskId(null);
                                                            }}
                                                            className="p-2 text-slate-400 dark:text-slate-500 hover:text-red-400 transition flex-shrink-0"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>

                                                    {/* Expanded edit panel */}
                                                    {isEditing && (
                                                        <div className="border-t border-slate-300 dark:border-slate-700 p-4 space-y-3 bg-slate-100 dark:bg-slate-800/60 rounded-b-lg">
                                                            <div>
                                                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Bezeichnung</label>
                                                                <input
                                                                    type="text"
                                                                    value={task.label}
                                                                    onChange={(e) => updateTask({ label: e.target.value })}
                                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Beschreibung</label>
                                                                <input
                                                                    type="text"
                                                                    value={task.description || ''}
                                                                    onChange={(e) => updateTask({ description: e.target.value })}
                                                                    placeholder="Optional"
                                                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Schwierigkeit (Sterne)</label>
                                                                <div className="flex gap-2">
                                                                    {([1, 2, 3] as const).map(d => (
                                                                        <button
                                                                            key={d}
                                                                            type="button"
                                                                            onClick={() => updateTask({ difficulty: d })}
                                                                            className={`px-4 py-2 rounded-lg font-bold transition text-sm ${
                                                                                (task.difficulty || 1) === d
                                                                                    ? 'bg-yellow-500 text-slate-900'
                                                                                    : 'bg-slate-300 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-400 dark:hover:bg-slate-600'
                                                                            }`}
                                                                        >
                                                                            {'★'.repeat(d)} {d === 1 ? 'Leicht' : d === 2 ? 'Mittel' : 'Schwer'}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Intervall</label>
                                                                <select
                                                                    value={task.rotation}
                                                                    onChange={(e) => updateTask({ rotation: e.target.value as 'daily' | 'weekly' | 'none' })}
                                                                    className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                                >
                                                                    <option value="weekly">Wöchentlich</option>
                                                                    <option value="daily">Täglich</option>
                                                                    <option value="none">Manuell</option>
                                                                </select>
                                                            </div>
                                                            <button
                                                                onClick={() => setEditingTaskId(null)}
                                                                className="text-sm text-blue-500 dark:text-blue-400 hover:text-blue-400 dark:hover:text-blue-300 font-bold"
                                                            >
                                                                Fertig
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {(!config.chores?.tasks || config.chores.tasks.length === 0) && (
                                            <p className="text-slate-400 dark:text-slate-500 italic text-sm">Keine Aufgaben angelegt.</p>
                                        )}
                                    </div>

                                    <div className="border-t border-slate-300 dark:border-slate-700 pt-4 mt-4">
                                        <h4 className="text-sm font-bold text-slate-500 dark:text-slate-400 mb-2">Aufgabe hinzufügen</h4>
                                        <form
                                            className="space-y-4"
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                const form = e.target as HTMLFormElement;
                                                const label = (form.elements.namedItem('label') as HTMLInputElement).value;
                                                const description = (form.elements.namedItem('description') as HTMLInputElement).value;
                                                const rotation = (form.elements.namedItem('rotation') as HTMLSelectElement).value;
                                                if (!label) return;

                                                const newTask = {
                                                    id: Date.now().toString(),
                                                    label,
                                                    description,
                                                    icon: newTaskIcon,
                                                    rotation: rotation as any,
                                                    difficulty: newTaskDifficulty,
                                                    assignedTo: undefined
                                                };
                                                const newTasks = [...(config.chores?.tasks || []), newTask];
                                                updateConfig({ chores: { ...(config.chores || { kids: [], settings: { interval: 'weekly' } }), tasks: newTasks } as any });
                                                form.reset();
                                                setNewTaskIcon('clean');
                                                setNewTaskDifficulty(1);
                                            }}
                                        >
                                            <div className="grid grid-cols-[1fr_auto] gap-2">
                                                <input
                                                    type="text"
                                                    name="label"
                                                    placeholder="Bezeichnung (z.B. Müll rausbringen)"
                                                    className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 w-full"
                                                    required
                                                />
                                                <input
                                                    type="text"
                                                    name="description"
                                                    placeholder="Beschreibung (optional)"
                                                    className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 w-full col-span-2"
                                                />
                                                <select
                                                    name="rotation"
                                                    className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                                                >
                                                    <option value="weekly">Wöchentlich</option>
                                                    <option value="daily">Täglich</option>
                                                    <option value="none">Manuell</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm text-slate-500 dark:text-slate-400 mb-2">Schwierigkeit (Sterne pro Erledigung):</label>
                                                <div className="flex gap-2">
                                                    {([1, 2, 3] as const).map(d => (
                                                        <button
                                                            key={d}
                                                            type="button"
                                                            onClick={() => setNewTaskDifficulty(d)}
                                                            className={`px-3 py-2 rounded-lg text-sm font-bold transition flex items-center gap-1 ${
                                                                newTaskDifficulty === d
                                                                    ? 'bg-yellow-600 text-white shadow-lg'
                                                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700'
                                                            }`}
                                                        >
                                                            {'★'.repeat(d)}
                                                            <span className="ml-1">{d === 1 ? 'Leicht' : d === 2 ? 'Mittel' : 'Schwer'}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm text-slate-500 dark:text-slate-400 mb-2">Symbol wählen:</label>
                                                <div className="flex flex-wrap gap-2">
                                                    {Object.keys(IconMap).map((iconKey) => (
                                                        <button
                                                            key={iconKey}
                                                            type="button"
                                                            onClick={() => setNewTaskIcon(iconKey)}
                                                            className={`p-2 rounded-lg transition ${newTaskIcon === iconKey
                                                                ? 'bg-blue-600 text-white shadow-lg scale-110'
                                                                : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700'
                                                                }`}
                                                        >
                                                            <ChoreIcon icon={iconKey} className="w-5 h-5" />
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <button
                                                type="submit"
                                                className="bg-blue-600 text-white px-4 py-2 rounded font-bold hover:bg-blue-500 flex items-center w-full justify-center"
                                            >
                                                <Plus className="w-5 h-5 mr-2" />
                                                Aufgabe hinzufügen
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            </section>
                        </div>
                    )
                }

                {/* 8. BELOHNUNGEN TAB */}
                {activeTab === 'belohnungen' && (
                    <div className="space-y-8">
                        {/* Mode Selection */}
                        <section>
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Belohnungsmodus</h3>
                            <div className="bg-white/40 dark:bg-slate-900/40 rounded-xl border border-slate-300/50 dark:border-slate-700/50 p-4">
                                <div className="flex gap-4">
                                    <button
                                        onClick={() => updateConfig({ rewards: { ...config.rewards!, mode: 'individual' } })}
                                        className={`flex-1 p-4 rounded-xl border-2 transition ${
                                            config.rewards?.mode === 'individual'
                                                ? 'border-blue-500 bg-blue-600/20'
                                                : 'border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800'
                                        }`}
                                    >
                                        <div className="font-bold text-slate-900 dark:text-white">Individuell</div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400">Jedes Kind sammelt eigene Sterne</div>
                                    </button>
                                    <button
                                        onClick={() => updateConfig({ rewards: { ...config.rewards!, mode: 'shared' } })}
                                        className={`flex-1 p-4 rounded-xl border-2 transition ${
                                            config.rewards?.mode === 'shared'
                                                ? 'border-blue-500 bg-blue-600/20'
                                                : 'border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800'
                                        }`}
                                    >
                                        <div className="font-bold text-slate-900 dark:text-white">Gemeinsam</div>
                                        <div className="text-sm text-slate-500 dark:text-slate-400">Alle Kinder sammeln zusammen</div>
                                    </button>
                                </div>
                            </div>
                        </section>

                        {/* Target Stars */}
                        <section>
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Ziel-Sterne</h3>
                            <div className="bg-white/40 dark:bg-slate-900/40 rounded-xl border border-slate-300/50 dark:border-slate-700/50 p-4 flex items-center gap-3">
                                <input
                                    type="number"
                                    min="5"
                                    max="100"
                                    value={config.rewards?.targetStars || 20}
                                    onChange={(e) => updateConfig({
                                        rewards: { ...config.rewards!, targetStars: parseInt(e.target.value) || 20 }
                                    })}
                                    className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white w-24 text-center text-lg focus:outline-none focus:border-blue-500"
                                />
                                <span className="text-slate-500 dark:text-slate-400">Sterne bis zur Belohnung</span>
                            </div>
                        </section>

                        {/* Current Reward */}
                        <section>
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Aktuelle Belohnung</h3>
                            <div className="bg-white/40 dark:bg-slate-900/40 rounded-xl border border-slate-300/50 dark:border-slate-700/50 p-4 space-y-4">
                                <input
                                    type="text"
                                    value={config.rewards?.currentReward || ''}
                                    onChange={(e) => updateConfig({
                                        rewards: { ...config.rewards!, currentReward: e.target.value }
                                    })}
                                    placeholder="z.B. Eis essen gehen, Kinobesuch..."
                                    className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white w-full focus:outline-none focus:border-blue-500"
                                />
                                <div>
                                    <label className="block text-sm text-slate-500 dark:text-slate-400 mb-2">Bild (optional)</label>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            const reader = new FileReader();
                                            reader.onload = (ev) => {
                                                updateConfig({
                                                    rewards: { ...config.rewards!, rewardImage: ev.target?.result as string }
                                                });
                                            };
                                            reader.readAsDataURL(file);
                                        }}
                                        className="text-slate-500 dark:text-slate-400"
                                    />
                                    {config.rewards?.rewardImage && (
                                        <div className="mt-2 flex items-center gap-3">
                                            <img src={config.rewards.rewardImage} alt="Belohnung" className="w-16 h-16 rounded-lg object-cover" />
                                            <button
                                                onClick={() => updateConfig({ rewards: { ...config.rewards!, rewardImage: undefined } })}
                                                className="text-sm text-red-400 hover:text-red-300"
                                            >
                                                Bild entfernen
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>

                        {/* Current Stars Overview */}
                        <section>
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4">Aktueller Stand</h3>
                            <div className="bg-white/40 dark:bg-slate-900/40 rounded-xl border border-slate-300/50 dark:border-slate-700/50 p-4 space-y-3">
                                {config.rewards?.mode === 'shared' ? (
                                    <div className="text-lg text-slate-900 dark:text-white">
                                        Gemeinsam: <span className="text-yellow-400 font-bold">{config.rewards?.sharedStars || 0}</span> / {config.rewards?.targetStars || 20} Sterne
                                    </div>
                                ) : (
                                    (config.chores?.kids || []).map(kid => (
                                        <div key={kid.id} className="flex items-center gap-3">
                                            <div className="w-6 h-6 rounded-full" style={{ backgroundColor: kid.color }} />
                                            <span className="text-slate-900 dark:text-white font-medium">{kid.name}:</span>
                                            <span className="text-yellow-400 font-bold">
                                                {config.rewards?.kidStars?.[kid.id] || 0}
                                            </span>
                                            <span className="text-slate-400 dark:text-slate-500">/ {config.rewards?.targetStars || 20}</span>
                                        </div>
                                    ))
                                )}

                                <button
                                    onClick={() => {
                                        if (!confirm('Sterne wirklich zurücksetzen?')) return;
                                        updateConfig({
                                            rewards: {
                                                ...config.rewards!,
                                                kidStars: {},
                                                sharedStars: 0
                                            }
                                        });
                                    }}
                                    className="mt-4 px-4 py-2 bg-red-600/20 text-red-400 rounded-lg border border-red-600/30 hover:bg-red-600/40 transition text-sm"
                                >
                                    Sterne zurücksetzen
                                </button>
                            </div>
                        </section>

                        {/* Bonus Stars */}
                        <section>
                            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                                <Star className="w-5 h-5 text-yellow-400" />
                                Bonus-Sterne vergeben
                            </h3>
                            <div className="bg-white/40 dark:bg-slate-900/40 rounded-xl border border-slate-300/50 dark:border-slate-700/50 p-4 space-y-4">
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    Vergib Sterne für außergewöhnliche Leistungen, die nicht als reguläre Aufgabe hinterlegt sind.
                                </p>

                                {/* Kid Selection */}
                                <div>
                                    <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Kind</label>
                                    <select
                                        value={bonusKidId}
                                        onChange={(e) => setBonusKidId(e.target.value)}
                                        className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white w-full focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="">Kind auswählen...</option>
                                        {(config.chores?.kids || []).map(kid => (
                                            <option key={kid.id} value={kid.id}>{kid.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Stars Selection */}
                                <div>
                                    <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Anzahl Sterne</label>
                                    <div className="flex gap-2">
                                        {[1, 2, 3, 4, 5].map(n => (
                                            <button
                                                key={n}
                                                onClick={() => setBonusStars(n)}
                                                className={`flex items-center gap-1 px-3 py-2 rounded-lg border-2 transition font-medium ${
                                                    bonusStars === n
                                                        ? 'border-yellow-400 bg-yellow-400/20 text-yellow-500 dark:text-yellow-300'
                                                        : 'border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                                                }`}
                                            >
                                                {n} <Star className="w-4 h-4 fill-current" />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Reason */}
                                <div>
                                    <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Grund (optional)</label>
                                    <input
                                        type="text"
                                        value={bonusReason}
                                        onChange={(e) => setBonusReason(e.target.value)}
                                        placeholder="z.B. Zimmer freiwillig aufgeräumt, super Zeugnis..."
                                        className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white w-full focus:outline-none focus:border-blue-500"
                                    />
                                </div>

                                {/* Submit */}
                                <div className="flex items-center gap-3">
                                    <button
                                        disabled={!bonusKidId || bonusSending}
                                        onClick={async () => {
                                            setBonusSending(true);
                                            setBonusSuccess('');
                                            try {
                                                const res = await fetch(`${API_URL}/api/rewards/bonus`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                                                    body: JSON.stringify({ kidId: bonusKidId, stars: bonusStars, reason: bonusReason })
                                                });
                                                const data = await res.json();
                                                if (data.success) {
                                                    updateConfig({ rewards: data.rewards });
                                                    const kidName = config.chores?.kids?.find(k => k.id === bonusKidId)?.name || '';
                                                    setBonusSuccess(`${bonusStars} Stern${bonusStars > 1 ? 'e' : ''} an ${kidName} vergeben!`);
                                                    setBonusReason('');
                                                    setTimeout(() => setBonusSuccess(''), 3000);
                                                }
                                            } catch (e) {
                                                console.error('Bonus award failed', e);
                                            }
                                            setBonusSending(false);
                                        }}
                                        className="px-5 py-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-900 font-bold rounded-lg transition flex items-center gap-2"
                                    >
                                        <Star className="w-4 h-4" />
                                        {bonusSending ? 'Wird vergeben...' : 'Sterne vergeben'}
                                    </button>
                                    {bonusSuccess && (
                                        <span className="text-green-400 font-medium animate-pulse">{bonusSuccess}</span>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {/* CAT CARE & NOTE TAB */}
                {activeTab === 'katze' && (
                    <div className="space-y-6">
                        {/* Katze */}
                        <section className="bg-slate-200/30 dark:bg-slate-800/30 p-6 rounded-xl border border-slate-300 dark:border-slate-700 space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <Cat className="w-5 h-5 text-pink-400" />
                                    Katzen-Tracking
                                </h3>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!config.catCare?.enabled}
                                        onChange={(e) => updateConfig({
                                            catCare: { ...(config.catCare || {} as any), enabled: e.target.checked }
                                        })}
                                        className="w-5 h-5"
                                    />
                                    <span className="text-sm text-slate-700 dark:text-slate-200">Aktiv</span>
                                </label>
                            </div>

                            {config.catCare?.enabled && (
                                <div className="space-y-6">
                                    {/* Feeding times */}
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                            Fütterungszeiten (HH:MM)
                                        </label>
                                        <div className="flex flex-wrap gap-2 items-center">
                                            {(config.catCare?.feedingTimes || []).map((t, idx) => (
                                                <div key={idx} className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1">
                                                    <input
                                                        type="time"
                                                        value={t}
                                                        onChange={(e) => {
                                                            const times = [...(config.catCare?.feedingTimes || [])];
                                                            times[idx] = e.target.value;
                                                            updateConfig({
                                                                catCare: { ...(config.catCare || {} as any), feedingTimes: times }
                                                            });
                                                        }}
                                                        className="bg-transparent text-slate-900 dark:text-white text-lg font-mono focus:outline-none"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const times = (config.catCare?.feedingTimes || []).filter((_, i) => i !== idx);
                                                            updateConfig({
                                                                catCare: { ...(config.catCare || {} as any), feedingTimes: times }
                                                            });
                                                        }}
                                                        className="text-red-500 hover:text-red-700 p-1"
                                                        title="Entfernen"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                            <button
                                                onClick={() => {
                                                    const times = [...(config.catCare?.feedingTimes || []), '12:00'];
                                                    updateConfig({
                                                        catCare: { ...(config.catCare || {} as any), feedingTimes: times }
                                                    });
                                                }}
                                                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-medium"
                                            >
                                                <Plus className="w-4 h-4" />
                                                Zeit hinzufügen
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                            Reset erfolgt automatisch um Mitternacht.
                                        </p>
                                    </div>

                                    {/* Grace window */}
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                            Vorab-Fenster (Grace) in Minuten: <span className="font-mono text-blue-500">{config.catCare?.gracePreMinutes ?? 120}</span>
                                        </label>
                                        <input
                                            type="range"
                                            min={0}
                                            max={240}
                                            step={15}
                                            value={config.catCare?.gracePreMinutes ?? 120}
                                            onChange={(e) => updateConfig({
                                                catCare: { ...(config.catCare || {} as any), gracePreMinutes: Number(e.target.value) }
                                            })}
                                            className="w-full"
                                        />
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                            So viele Minuten <em>vor</em> der Fütterungszeit zählt ein Klick bereits als erledigt. Pro Klick wird nur eine Zeit markiert — keine Doppel-Erfassung.
                                        </p>
                                    </div>

                                    {/* Litter */}
                                    <div className="border-t border-slate-300 dark:border-slate-700 pt-4">
                                        <label className="flex items-center gap-2 cursor-pointer mb-3">
                                            <input
                                                type="checkbox"
                                                checked={!!config.catCare?.litterEnabled}
                                                onChange={(e) => updateConfig({
                                                    catCare: { ...(config.catCare || {} as any), litterEnabled: e.target.checked }
                                                })}
                                                className="w-5 h-5"
                                            />
                                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                Katzenklo-Reinigung tracken
                                            </span>
                                        </label>

                                        {config.catCare?.litterEnabled && (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                                                        Intervall (Tage)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        max={14}
                                                        value={config.catCare?.litterIntervalDays ?? 2}
                                                        onChange={(e) => updateConfig({
                                                            catCare: { ...(config.catCare || {} as any), litterIntervalDays: Math.max(1, Number(e.target.value)) }
                                                        })}
                                                        className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 w-full text-lg text-slate-900 dark:text-white"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                                                        Fällig-Uhrzeit
                                                    </label>
                                                    <input
                                                        type="time"
                                                        value={config.catCare?.litterTime || '08:00'}
                                                        onChange={(e) => updateConfig({
                                                            catCare: { ...(config.catCare || {} as any), litterTime: e.target.value }
                                                        })}
                                                        className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 w-full text-lg text-slate-900 dark:text-white font-mono"
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* Notiz */}
                        <section className="bg-slate-200/30 dark:bg-slate-800/30 p-6 rounded-xl border border-slate-300 dark:border-slate-700 space-y-4">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <StickyNote className="w-5 h-5 text-yellow-400" />
                                Familien-Notiz
                            </h3>

                            <label className="block text-sm text-slate-600 dark:text-slate-300">
                                Text (wird im Header, auf dem Nacht-Screensaver und in der Foto-Slideshow angezeigt):
                            </label>
                            <textarea
                                value={config.note?.text || ''}
                                onChange={(e) => updateConfig({
                                    note: { text: e.target.value, updatedAt: Date.now(), author: config.note?.author }
                                })}
                                onFocus={() => !isKeyboardActive && toggleKeyboard()}
                                rows={3}
                                placeholder="Z.B. 'Denk an den Elternabend am Mittwoch 19:00'"
                                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-3 text-lg text-slate-900 dark:text-white"
                            />
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                    Leer lassen, um die Notiz zu entfernen.
                                </span>
                                <button
                                    onClick={() => updateConfig({ note: { text: '', updatedAt: Date.now() } })}
                                    className="text-sm text-red-600 dark:text-red-400 hover:underline"
                                >
                                    Notiz löschen
                                </button>
                            </div>
                        </section>
                    </div>
                )}

                {/* 6. GERÄTE TAB (Security) */}
                {
                    activeTab === 'geraete' && (
                        <div className="space-y-6">
                            <section className="bg-slate-200/30 dark:bg-slate-800/30 p-6 rounded-xl border border-slate-300 dark:border-slate-700">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-blue-400" />
                                    Admin-PIN
                                </h3>
                                <div className="flex items-center gap-4">
                                    <input
                                        type="password"
                                        value={config.adminPin || '1234'}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                            updateConfig({ adminPin: val });
                                        }}
                                        placeholder="PIN (4-6 Ziffern)"
                                        className="bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-3 text-xl text-center w-48 font-mono tracking-widest focus:outline-none focus:border-blue-500"
                                        maxLength={6}
                                    />
                                    <span className="text-sm text-slate-500 dark:text-slate-400">
                                        4-6 Ziffern zum Entsperren des Adminbereichs
                                    </span>
                                </div>
                            </section>
                            <DeviceList />
                        </div>
                    )
                }
            </div >

            <div className="mt-auto pt-8 flex justify-end">
                <div className="flex items-center space-x-2 text-green-400">
                    <Save className="w-5 h-5" />
                    <span>Einstellungen automatisch gespeichert</span>
                </div>
            </div>
        </div >
    );
};

export default AdminSettings;
