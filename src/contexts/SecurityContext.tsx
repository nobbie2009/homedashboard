import React, { createContext, useContext, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getApiUrl } from '../utils/api';

interface Device {
    id: string;
    name: string;
    status: 'pending' | 'approved' | 'rejected' | 'unknown';
}

interface SecurityContextType {
    deviceId: string;
    deviceStatus: Device['status'];
    device: Device | null;
    checkStatus: () => Promise<void>;
    register: (name: string) => Promise<void>;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

const STORAGE_KEY = 'homedashboard_device_id';

export function SecurityProvider({ children }: { children: React.ReactNode }) {
    const [deviceId, setDeviceId] = useState<string>('');
    const [deviceStatus, setDeviceStatus] = useState<Device['status']>('unknown');
    const [device, setDevice] = useState<Device | null>(null);
    const [isChecking, setIsChecking] = useState(true);

    const API_URL = getApiUrl();

    // Initialize Device ID
    useEffect(() => {
        let id = localStorage.getItem(STORAGE_KEY);
        if (!id) {
            id = uuidv4();
            localStorage.setItem(STORAGE_KEY, id);
        }
        setDeviceId(id!);
    }, []);

    const checkStatus = async () => {
        if (!deviceId) return;

        try {
            const res = await fetch(`${API_URL}/api/auth/status`, {
                headers: { 'x-device-id': deviceId }
            });
            const data = await res.json();

            if (data.status) {
                setDeviceStatus(data.status);
                setDevice(data);
            }
        } catch (e) {
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

    if (isChecking) {
        return <div className="flex items-center justify-center h-screen bg-slate-900 text-white">Lade Sicherheitsstatus...</div>;
    }

    return (
        <SecurityContext.Provider value={{ deviceId, deviceStatus, device, checkStatus, register }}>
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
