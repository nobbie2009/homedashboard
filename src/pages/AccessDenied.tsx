import React, { useState, useEffect } from 'react';
import { useSecurity } from '../contexts/SecurityContext'; // Adjust path if needed
import { ShieldAlert, Lock, RefreshCw } from 'lucide-react';


const AccessDenied: React.FC = () => {
    const { deviceId, deviceStatus, register, checkStatus } = useSecurity();
    const [deviceName, setDeviceName] = useState('');

    useEffect(() => {
        // Auto-fill a name (e.g. Browser/OS)
        setDeviceName(`${navigator.platform} Browser`);
    }, []);

    const handleRegister = async () => {
        await register(deviceName);
    };

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-slate-200 p-6">
            <div className="max-w-md w-full bg-slate-800 rounded-xl p-8 shadow-2xl border border-slate-700">
                <div className="flex justify-center mb-6">
                    {deviceStatus === 'pending' ? (
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

                {deviceStatus === 'unknown' && (
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
            </div>
        </div>
    );
};

export default AccessDenied;
