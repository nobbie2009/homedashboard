import React, { createContext, useContext, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getApiUrl } from '../utils/api';

interface Device {
    id: string;
    name: string;
    status: 'pending' | 'approved' | 'rejected' | 'unknown';
    storeBroken?: boolean;
}

interface SecurityContextType {
    deviceId: string;
    deviceStatus: Device['status'];
    device: Device | null;
    storeBroken: boolean;
    checkStatus: () => Promise<void>;
    register: (name: string) => Promise<void>;
    unlock: (password: string, name: string) => Promise<void>;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

const STORAGE_KEY = 'homedashboard_device_id';
const STATUS_KEY = 'homedashboard_device_status';

function readCachedStatus(): Device['status'] {
    const s = localStorage.getItem(STATUS_KEY);
    if (s === 'approved' || s === 'pending' || s === 'rejected') return s;
    return 'unknown';
}

export function SecurityProvider({ children }: { children: React.ReactNode }) {
    // Resolve the device id synchronously on first render. Doing this in a
    // useEffect left deviceId empty for the initial paint, so every component
    // that fetched on mount (system/ip, SSE, spotify/devices, ...) sent an
    // empty x-device-id header and got a 401 until the id arrived.
    const [deviceId] = useState<string>(() => {
        let id = localStorage.getItem(STORAGE_KEY);
        if (!id) {
            id = uuidv4();
            localStorage.setItem(STORAGE_KEY, id);
        }
        return id;
    });
    const [deviceStatus, setDeviceStatus] = useState<Device['status']>(() => readCachedStatus());
    const [device, setDevice] = useState<Device | null>(null);
    const [storeBroken, setStoreBroken] = useState(false);
    // Block the UI on first ever load. If a previous approval is cached we render
    // immediately and revalidate in the background, so the app works offline.
    const [isChecking, setIsChecking] = useState(() => readCachedStatus() !== 'approved');

    const API_URL = getApiUrl();

    const checkStatus = async () => {
        if (!deviceId) return;

        try {
            const res = await fetch(`${API_URL}/api/auth/status`, {
                headers: { 'x-device-id': deviceId }
            });
            const data = await res.json();

            setStoreBroken(Boolean(data.storeBroken));

            // A broken device store on the server reports every device as
            // 'unknown'. Show the lock screen (every API call would 403 anyway)
            // but keep the cached approval in localStorage, so the device is
            // back to normal as soon as the server can read its list again.
            if (data.storeBroken && data.status === 'unknown') {
                setDeviceStatus('unknown');
                return;
            }

            if (data.status) {
                setDeviceStatus(data.status);
                setDevice(data);
                localStorage.setItem(STATUS_KEY, data.status);
            }
        } catch (e) {
            // Offline / server unreachable: keep the last known status from
            // localStorage so an already-approved device stays usable offline.
            console.error("Failed to check status", e);
        } finally {
            setIsChecking(false);
        }
    };

    // Initial check
    useEffect(() => {
        if (deviceId) {
            checkStatus();
        }
    }, [deviceId]);

    // interceptor-like behavior (handled by components checking status, 
    // or we could wrap fetch, but for now we rely on the status check blocking the UI)

    const register = async (name: string) => {
        await fetch(`${API_URL}/api/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-device-id': deviceId
            },
            body: JSON.stringify({ id: deviceId, name })
        });
        await checkStatus();
    };

    // Self-service unlock with the admin password. Needed whenever no approved
    // device is left to approve this one from.
    const unlock = async (password: string, name: string) => {
        const res = await fetch(`${API_URL}/api/auth/unlock`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-device-id': deviceId
            },
            body: JSON.stringify({ password, id: deviceId, name })
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(
                res.status === 401
                    ? 'Falsches Admin-Passwort.'
                    : data.error || `Freischalten fehlgeschlagen (${res.status}).`
            );
        }

        await checkStatus();
    };

    if (isChecking) {
        return <div className="flex items-center justify-center h-screen bg-slate-900 text-white">Lade Sicherheitsstatus...</div>;
    }

    return (
        <SecurityContext.Provider value={{ deviceId, deviceStatus, device, storeBroken, checkStatus, register, unlock }}>
            {children}
        </SecurityContext.Provider>
    );
}

export function useSecurity() {
    const context = useContext(SecurityContext);
    if (context === undefined) {
        throw new Error('useSecurity must be used within a SecurityProvider');
    }
    return context;
}
