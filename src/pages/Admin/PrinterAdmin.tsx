import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { useSecurity } from '../../contexts/SecurityContext';
import { getApiUrl, fetchWithTimeout } from '../../utils/api';

const inputClass = "bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-4 py-2 w-full focus:outline-none focus:border-blue-500";

/** Einstellungen für den Bluetooth-Küchendrucker am Pi. */
export const PrinterAdmin: React.FC = () => {
    const { config, updateConfig } = useConfig();
    const { deviceId } = useSecurity();
    const printer = config.printer || {};
    const [status, setStatus] = useState<string>('');

    const update = (partial: Partial<NonNullable<typeof config.printer>>) =>
        updateConfig({ printer: { ...printer, ...partial } });

    const checkStatus = async () => {
        setStatus('Prüfe…');
        try {
            const res = await fetchWithTimeout(`${getApiUrl()}/api/printer/status`, {
                headers: { 'x-device-id': deviceId }
            }, 35000);
            const data = await res.json().catch(() => ({}));
            setStatus(res.ok ? `OK: ${JSON.stringify(data)}` : `Fehler: ${data.error || res.status}`);
        } catch (e) {
            setStatus(`Fehler: ${(e as Error).message}`);
        }
    };

    return (
        <section>
            <h3 className="text-xl font-semibold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                <Printer className="w-5 h-5" /> Küchendrucker
            </h3>
            <div className="space-y-4 max-w-md">
                <label className="flex items-center space-x-3">
                    <input
                        type="checkbox"
                        checked={printer.enabled !== false}
                        onChange={(e) => update({ enabled: e.target.checked })}
                        className="w-5 h-5 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                    />
                    <span>Druck-Buttons im Header anzeigen</span>
                </label>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    „Einkaufszettel" steht immer im Header, „Termine drucken" auf der Seite „Woche".
                    Welche Kalender auf die Terminliste kommen, steuert die Spalte „D" bei den Kalendern.
                    Gedruckt werden nur Uhrzeit, Titel und Kalendername.
                </p>
                <div>
                    <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Drucker-URL am Pi</label>
                    <input
                        type="text"
                        value={printer.url || ''}
                        onChange={(e) => update({ url: e.target.value || undefined })}
                        placeholder="http://192.168.178.178:8765"
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Einkaufsliste (HA-Todo-Entity, optional)</label>
                    <input
                        type="text"
                        value={printer.todoEntity || ''}
                        onChange={(e) => update({ todoEntity: e.target.value || undefined })}
                        placeholder="Vorgabe des Pi (todo.josi_und_norbert)"
                        className={inputClass}
                    />
                </div>
                <div>
                    <label className="block text-sm text-slate-500 dark:text-slate-400 mb-1">Überschrift Einkaufszettel (optional)</label>
                    <input
                        type="text"
                        value={printer.shoppingTitle || ''}
                        onChange={(e) => update({ shoppingTitle: e.target.value || undefined })}
                        placeholder="EDEKA"
                        className={inputClass}
                    />
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={checkStatus}
                        className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-sm"
                    >
                        Status prüfen
                    </button>
                    {status && <span className="text-xs font-mono text-slate-500 dark:text-slate-400 break-all">{status}</span>}
                </div>
            </div>
        </section>
    );
};

export default PrinterAdmin;
