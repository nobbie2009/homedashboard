import React, { createContext, useContext, useState, useEffect } from 'react';
import { checkAndRotateChores } from '../utils/choreLogic';

// Define configuration types
export interface Kid {
    id: string;
    name: string;
    photo?: string; // base64 or URL
    color: string;
}

export interface Chore {
    id: string;
    label: string;
    description?: string;
    icon: string; // lucide icon name
    assignedTo?: string; // kidId
    rotation: 'daily' | 'weekly' | 'none';
}

export interface RotationSettings {
    interval: 'weekly' | 'daily';
    lastRotation?: number; // timestamp
}

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
        subdomain?: string;
    };
    google?: {
        selectedCalendars: string[];
        calendarColors?: Record<string, string>;
        calendarSettings?: Record<string, CalendarSettings>;
        pollInterval?: number; // Milliseconds
    };
    notionKey?: string;
    notionDatabaseId?: string;
    notionRefreshInterval?: number; // Minutes
    chores?: {
        kids: Kid[];
        tasks: Chore[];
        settings: RotationSettings;
    };
    santaRouteEnabled?: boolean;
    santaRouteAddress?: string;
    screensaver?: {
        enabled: boolean;
        start: string; // HH:mm
        end: string; // HH:mm
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
    edupage: { username: '', password: '', subdomain: 'login1' },
    google: { selectedCalendars: [], calendarColors: {}, calendarSettings: {} },
    notionKey: '',
    notionDatabaseId: '',
    notionRefreshInterval: 5, // Default 5 minutes
    chores: {
        kids: [
            { id: '1', name: 'Kind 1', color: 'blue' },
            { id: '2', name: 'Kind 2', color: 'pink' }
        ],
        tasks: [],
        settings: { interval: 'weekly' }
    },
    santaRouteEnabled: false,
    santaRouteAddress: '',
    screensaver: {
        enabled: false,
        start: '22:00',
        end: '06:00'
    }
};

import { getApiUrl } from '../utils/api';

import { useSecurity } from './SecurityContext';

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: React.ReactNode }) {
    const [config, setConfig] = useState<AppConfig>(defaultConfig);
    const { deviceId } = useSecurity();

    const API_URL = getApiUrl();

    // Load from Backend
    useEffect(() => {
        if (!deviceId) return;

        fetch(`${API_URL}/api/config`, {
            headers: { 'x-device-id': deviceId }
        })
            .then(res => {
                if (res.ok) return res.json();
                throw new Error("Failed to load config");
            })
            .then(data => {
                // Determine deep merge or just shallow? Shallow for now, but ensure nested objects exist
                setConfig(prev => {
                    const merged = {
                        ...prev,
                        ...data,
                        edupage: { ...prev.edupage, ...(data.edupage || {}) },
                        google: { ...prev.google, ...(data.google || {}) },
                        chores: {
                            kids: data.chores?.kids || prev.chores?.kids || [],
                            tasks: data.chores?.tasks || prev.chores?.tasks || [],
                            settings: { ...prev.chores?.settings, ...(data.chores?.settings || {}) }
                        },
                        screensaver: {
                            enabled: data.screensaver?.enabled ?? prev.screensaver?.enabled ?? false,
                            start: data.screensaver?.start || prev.screensaver?.start || '22:00',
                            end: data.screensaver?.end || prev.screensaver?.end || '06:00'
                        }
                    };

                    // Check for Chore Rotation
                    const rotationResult = checkAndRotateChores(merged);
                    if (rotationResult) {
                        console.log("Rotating Chores...", rotationResult);
                        const rotatedConfig = {
                            ...merged,
                            chores: {
                                ...merged.chores!,
                                tasks: rotationResult.tasks,
                                settings: {
                                    ...merged.chores!.settings,
                                    ...rotationResult.settings
                                }
                            }
                        };

                        // Persist rotated config to backend
                        fetch(`${API_URL}/api/config`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-device-id': deviceId
                            },
                            body: JSON.stringify(rotatedConfig)
                        }).catch(e => console.error("Auto-rotation save failed", e));

                        return rotatedConfig;
                    }

                    return merged;
                });
            })
            .catch(err => {
                console.error("Config load error:", err);
            });
    }, [deviceId]);

    const updateConfig = (newConfig: Partial<AppConfig>) => {
        setConfig((prev) => {
            const updated = { ...prev, ...newConfig };

            // Persist to backend (Debounced ideally, but simple POST for now)
            // We only send the partial update or full? 
            // Better send full updated config to be safe
            fetch(`${API_URL}/api/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-device-id': deviceId
                },
                body: JSON.stringify(updated)
            }).catch(e => {
                console.error("Failed to save config:", e);
                alert("Fehler beim Speichern der Konfiguration! (Größe/Netzwerk)");
            });

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
