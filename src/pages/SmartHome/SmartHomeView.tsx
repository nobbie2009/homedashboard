import React from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { Home, WifiOff } from 'lucide-react';

export const SmartHomeView: React.FC = () => {
    const { config } = useConfig();

    if (!config.haUrl) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                <Home className="w-16 h-16 opacity-50" />
                <h2 className="text-2xl font-semibold">Home Assistant nicht konfiguriert</h2>
                <p>Bitte hinterlege die Dashboard-URL in den Admin-Einstellungen.</p>
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-black rounded-2xl overflow-hidden border border-slate-800 relative bg-slate-900/50">
            <iframe
                src={config.haUrl}
                className="w-full h-full border-0"
                title="Home Assistant Dashboard"
                allow="fullscreen; microphone; camera; geolocation"
                sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
            />
            {/* Error Overlay could be added here if we detect load failure, though hard with cross-origin iframe */}
        </div>
    );
};

export default SmartHomeView;
