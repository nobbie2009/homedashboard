import React, { createContext, useContext, useState, useEffect } from 'react';

// Define configuration types
export interface AppConfig {
    weatherLocation: string;
    cameraUrl?: string; // RTSP or HTTP Stream URL
    haUrl?: string; // Home Assistant Dashboard URL
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
        calendarSettings?: Record<string, CalendarSettings>;
    };
}

export type CalendarScope = 'today' | 'weekWidget' | 'nextEvent' | 'weekView';

export interface CalendarSettings {
    id: string;
    color: string;
    alias: string;
    scopes: Record<CalendarScope, boolean>;
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
    google: { selectedCalendars: [], calendarColors: {}, calendarSettings: {} },
};

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
    const [config, setConfig] = useState<AppConfig>(defaultConfig);

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

    // Load from Backend
    useEffect(() => {
        fetch(`${API_URL}/api/config`)
            .then(res => {
                if (res.ok) return res.json();
                throw new Error("Failed to load config");
            })
            .then(data => {
                // Determine deep merge or just shallow? Shallow for now, but ensure nested objects exist
                setConfig(prev => ({
                    ...prev,
                    ...data,
                    // Ensure nested objects are merged correctly if partial data comes back
                    edupage: { ...prev.edupage, ...(data.edupage || {}) },
                    google: { ...prev.google, ...(data.google || {}) }
                }));
            })
            .catch(err => {
                console.error("Config load error:", err);
            });
    }, []);

    const updateConfig = (newConfig: Partial<AppConfig>) => {
        setConfig((prev) => {
            const updated = { ...prev, ...newConfig };

            // Persist to backend (Debounced ideally, but simple POST for now)
            // We only send the partial update or full? 
            // Better send full updated config to be safe
            fetch(`${API_URL}/api/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
            }).catch(e => console.error("Failed to save config:", e));

            return updated;
        });
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
