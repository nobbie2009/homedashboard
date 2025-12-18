import React, { createContext, useContext, useState } from 'react';

// Define configuration types
export interface AppConfig {
    weatherLocation: string;
    enabledCalendars: string[];
    showSeconds: boolean;
    schoolNames: string[];
    edupage?: {
        username?: string;
        password?: string;
    };
    google?: {
        selectedCalendars: string[];
        calendarColors?: Record<string, string>;
    };
}

interface ConfigContextType {
    config: AppConfig;
    updateConfig: (newConfig: Partial<AppConfig>) => void;
}

const defaultConfig: AppConfig = {
    weatherLocation: 'Berlin',
    enabledCalendars: ['family', 'school', 'garbage'],
    showSeconds: false,
    schoolNames: ['Max', 'Moritz'],
    edupage: { username: '', password: '' },
    google: { selectedCalendars: [], calendarColors: {} },
};

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
    const [config, setConfig] = useState<AppConfig>(defaultConfig);

    const updateConfig = (newConfig: Partial<AppConfig>) => {
        setConfig((prev) => ({ ...prev, ...newConfig }));
    };

    return (
        <ConfigContext.Provider value={{ config, updateConfig }}>
            {children}
        </ConfigContext.Provider>
    );
}

export function useConfig() {
    const context = useContext(ConfigContext);
    if (context === undefined) {
        throw new Error('useConfig must be used within a ConfigProvider');
    }
    return context;
}
