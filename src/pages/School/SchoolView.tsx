import React from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { Home, ExternalLink } from 'lucide-react';

export const SchoolView: React.FC = () => {
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
        <div className="h-full w-full bg-black rounded-2xl overflow-hidden border border-slate-800 relative">
            <iframe
                src={config.haUrl}
                className="w-full h-full border-0"
                title="Home Assistant Dashboard"
                allow="fullscreen"
            />
            {/* Optional Overlay to show it's externally loaded, usually not needed for Kiosk */}
        </div>
    );
};
