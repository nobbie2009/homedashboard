import React, { useState, useEffect } from 'react';
import { useKiosk } from '../../contexts/KioskContext';
import { useConfig } from '../../contexts/ConfigContext';
import { Lock, Save, Calendar as CalendarIcon, CheckCircle } from 'lucide-react';
// import clsx from 'clsx';

const AdminSettings: React.FC = () => {
    const { isLocked, unlock, lock } = useKiosk();
    const { config, updateConfig } = useConfig();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [remoteCalendars, setRemoteCalendars] = useState<any[]>([]);
    const [isGoogleAuth, setIsGoogleAuth] = useState(false);

    // Use env var or default to localhost
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

    const handleToggleCalendar = (cal: string) => {
        const newCalendars = config.enabledCalendars.includes(cal)
            ? config.enabledCalendars.filter(c => c !== cal)
            : [...config.enabledCalendars, cal];
        updateConfig({ enabledCalendars: newCalendars });
    };

    const handleToggleGoogleCalendar = (calId: string) => {
        const current = config.google?.selectedCalendars || [];
        const newSelection = current.includes(calId)
            ? current.filter(id => id !== calId)
            : [...current, calId];
        updateConfig({ google: { ...config.google, selectedCalendars: newSelection } });
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
            <div className="flex justify-between items-center mb-8 border-b border-slate-700 pb-4">
                <h2 className="text-3xl font-bold text-white">Einstellungen</h2>
                <button
                    onClick={lock}
                    className="flex items-center space-x-2 bg-slate-800 px-4 py-2 rounded-lg hover:bg-slate-700 transition"
                >
                    <Lock className="w-4 h-4" />
                    <span>Sperren</span>
                </button>
            </div>

            <div className="space-y-8">
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
                </section>

                <section>
                    <h3 className="text-xl font-semibold text-slate-300 mb-4">Sichtbare Kalender</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {['family', 'work', 'school', 'garbage'].map(cal => (
                            <label key={cal} className="flex items-center space-x-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700 cursor-pointer hover:bg-slate-800 transition">
                                <input
                                    type="checkbox"
                                    checked={config.enabledCalendars.includes(cal)}
                                    onChange={() => handleToggleCalendar(cal)}
                                    className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                                />
                                <span className="capitalize text-lg">{cal}</span>
                            </label>
                        ))}
                    </div>
                </section>

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
                    </div>
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
