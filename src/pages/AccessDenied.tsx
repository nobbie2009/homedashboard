import React, { useState, useEffect } from 'react';
import { useSecurity } from '../contexts/SecurityContext'; // Adjust path if needed
import { ShieldAlert, Lock, RefreshCw, KeyRound, ServerCrash } from 'lucide-react';


const AccessDenied: React.FC = () => {
    const { deviceId, deviceStatus, storeBroken, register, checkStatus, unlock } = useSecurity();
    const [deviceName, setDeviceName] = useState('');
    const [showUnlock, setShowUnlock] = useState(false);
    const [password, setPassword] = useState('');
    const [unlockError, setUnlockError] = useState('');
    const [unlocking, setUnlocking] = useState(false);

    useEffect(() => {
        // Auto-fill a name (e.g. Browser/OS)
        setDeviceName(`${navigator.platform} Browser`);
    }, []);

    const handleRegister = async () => {
        await register(deviceName);
    };

    const handleUnlock = async () => {
        setUnlockError('');
        setUnlocking(true);
        try {
            await unlock(password, deviceName);
            setPassword('');
        } catch (e: any) {
            setUnlockError(e?.message || 'Freischalten fehlgeschlagen.');
        } finally {
            setUnlocking(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-slate-200 p-6">
            <div className="max-w-md w-full bg-slate-800 rounded-xl p-8 shadow-2xl border border-slate-700">
                <div className="flex justify-center mb-6">
                    {storeBroken ? (
                        <ServerCrash className="w-20 h-20 text-orange-500" />
                    ) : deviceStatus === 'pending' ? (
                        <ShieldAlert className="w-20 h-20 text-yellow-500" />
                    ) : (
                        <Lock className="w-20 h-20 text-red-500" />
                    )}
                </div>

                <h1 className="text-2xl font-bold text-center text-white mb-2">
                    {deviceStatus === 'pending' ? 'Warte auf Freigabe' : 'Zugriff verweigert'}
                </h1>

                <p className="text-center text-slate-400 mb-6">
                    Dieses Gerät
                    <br />
                    <code className="bg-slate-900 px-2 py-1 rounded text-xs font-mono">{deviceId}</code>
                    <br />
                    ist noch nicht autorisiert.
                </p>

                {storeBroken && (
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 text-sm text-orange-200 mb-6">
                        Die Geräteliste auf dem Server ist beschädigt und konnte nicht gelesen werden.
                        Deshalb gelten aktuell alle Geräte als unbekannt. Auf dem Server prüfen:
                        <code className="block mt-2 bg-slate-900 px-2 py-1 rounded text-xs font-mono">
                            server/data/devices.json
                        </code>
                    </div>
                )}

                {deviceStatus === 'unknown' && !storeBroken && (
                    <div className="space-y-4">
                        <p className="text-sm text-center">Bitte geben Sie dem Gerät einen Namen, um Zugriff anzufordern:</p>
                        <input
                            type="text"
                            value={deviceName}
                            onChange={(e) => setDeviceName(e.target.value)}
                            placeholder="Gerätename (z.B. Tablet Küche)"
                            className="w-full bg-slate-900 border border-slate-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
                        />
                        <button
                            onClick={handleRegister}
                            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition"
                        >
                            Zugriff anfordern
                        </button>
                    </div>
                )}

                {deviceStatus === 'pending' && (
                    <div className="space-y-6">
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-sm text-yellow-200 text-center">
                            Anfrage gesendet. Bitte genehmigen Sie dieses Gerät im Admin-Panel eines anderen Geräts.
                        </div>

                        <button
                            onClick={checkStatus}
                            className="w-full flex items-center justify-center space-x-2 bg-slate-700 hover:bg-slate-600 py-3 rounded-lg transition"
                        >
                            <RefreshCw className="w-4 h-4" />
                            <span>Status prüfen</span>
                        </button>

                    </div>
                )}
                {deviceStatus === 'rejected' && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-sm text-red-200 text-center">
                        Zugriff wurde dauerhaft abgelehnt. Wenden Sie sich an den Administrator.
                    </div>
                )}

                {/* Escape hatch: without this, losing every approved device means
                    nobody can approve anything ever again from the UI. */}
                <div className="mt-6 pt-6 border-t border-slate-700">
                    {!showUnlock ? (
                        <button
                            onClick={() => setShowUnlock(true)}
                            className="w-full flex items-center justify-center space-x-2 text-sm text-slate-400 hover:text-white transition"
                        >
                            <KeyRound className="w-4 h-4" />
                            <span>Mit Admin-Passwort freischalten</span>
                        </button>
                    ) : (
                        <div className="space-y-3">
                            <p className="text-sm text-slate-400">
                                Kein anderes Gerät zur Hand? Mit dem Admin-Passwort kann dieses Gerät
                                sich selbst freischalten.
                            </p>
                            <input
                                type="text"
                                value={deviceName}
                                onChange={(e) => setDeviceName(e.target.value)}
                                placeholder="Gerätename (z.B. Tablet Küche)"
                                className="w-full bg-slate-900 border border-slate-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
                            />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
                                placeholder="Admin-Passwort"
                                autoComplete="current-password"
                                className="w-full bg-slate-900 border border-slate-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500"
                            />
                            {unlockError && (
                                <div className="text-sm text-red-400">{unlockError}</div>
                            )}
                            <button
                                onClick={handleUnlock}
                                disabled={unlocking || !password}
                                className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition"
                            >
                                {unlocking ? 'Wird freigeschaltet…' : 'Gerät freischalten'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AccessDenied;
