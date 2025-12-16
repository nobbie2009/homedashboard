import React, { useState } from 'react';
import { useKiosk } from '../../contexts/KioskContext';
import { useConfig } from '../../contexts/ConfigContext';
import { Lock, Save } from 'lucide-react';
// import clsx from 'clsx';

const AdminSettings: React.FC = () => {
    const { isLocked, unlock, lock } = useKiosk();
    const { config, updateConfig } = useConfig();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');

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
