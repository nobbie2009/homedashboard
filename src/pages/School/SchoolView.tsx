import React from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { GraduationCap } from 'lucide-react';

export const SchoolView: React.FC = () => {
    const { config } = useConfig();
    const hasCredentials = config.edupage?.username && config.edupage?.password;

    if (!hasCredentials) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
                <GraduationCap className="w-16 h-16 opacity-50" />
                <h2 className="text-2xl font-semibold">Edupage nicht konfiguriert</h2>
                <p>Bitte hinterlege Benutzername und Passwort in den Admin-Einstellungen.</p>
            </div>
        );
    }

    return (
        <div className="h-full w-full p-6 flex flex-col items-center justify-center text-slate-400">
            <GraduationCap className="w-12 h-12 mb-4 text-blue-400" />
            <h2 className="text-xl font-bold text-white mb-2">Schul-Dashboard</h2>
            <p>Lade Daten für {config.schoolNames.join(' & ')}...</p>
            {/* Actual implementation to follow */}
        </div>
    );
};

export default SchoolView;
