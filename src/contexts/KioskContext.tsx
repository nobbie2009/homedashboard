import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useConfig } from './ConfigContext';
import { useActivityTracker } from '../hooks/useActivityTracker';

interface KioskContextType {
    isLocked: boolean;
    unlock: (pin: string) => boolean;
    lock: () => void;
    lastActivity: React.MutableRefObject<number>;
    isKioskDevice: boolean;
}

const KioskContext = createContext<KioskContextType | undefined>(undefined);

const IDLE_TIMEOUT_MS = 60000;
const IDLE_CHECK_INTERVAL = 5000;
const KIOSK_DEVICE_KEY = 'is_kiosk_device';

function detectKioskDevice(): boolean {
    try {
        const params = new URLSearchParams(window.location.search);
        const paramValue = params.get('kiosk');
        if (paramValue === '1' || paramValue === 'true') {
            localStorage.setItem(KIOSK_DEVICE_KEY, 'true');
            return true;
        }
        if (paramValue === '0' || paramValue === 'false') {
            localStorage.removeItem(KIOSK_DEVICE_KEY);
            return false;
        }
        return localStorage.getItem(KIOSK_DEVICE_KEY) === 'true';
    } catch {
        return false;
    }
}

export function KioskProvider({ children }: { children: React.ReactNode }) {
    const { config } = useConfig();
    const [isKioskDevice] = useState(() => detectKioskDevice());
    const [isLocked, setIsLocked] = useState(() => {
        const stored = localStorage.getItem('kiosk_is_locked');
        return stored !== null ? JSON.parse(stored) : true;
    });

    const lock = useCallback(() => {
        setIsLocked(true);
        localStorage.setItem('kiosk_is_locked', 'true');
    }, []);

    // Single shared activity tracker — replaces all manual event listeners
    const lastActivity = useActivityTracker();

    const unlock = useCallback((pin: string) => {
        const adminPin = config.adminPin || '1234';
        if (pin === adminPin) {
            setIsLocked(false);
            localStorage.setItem('kiosk_is_locked', 'false');
            lastActivity.current = Date.now();
            return true;
        }
        return false;
    }, [config.adminPin, lastActivity]);

    // Idle check: lock after IDLE_TIMEOUT_MS of inactivity
    useEffect(() => {
        if (isLocked) return;

        const interval = setInterval(() => {
            if (Date.now() - lastActivity.current > IDLE_TIMEOUT_MS) {
                lock();
            }
        }, IDLE_CHECK_INTERVAL);

        return () => clearInterval(interval);
    }, [isLocked, lock, lastActivity]);

    return (
        <KioskContext.Provider value={{ isLocked, unlock, lock, lastActivity, isKioskDevice }}>
            {children}
        </KioskContext.Provider>
    );
}

export function useKiosk() {
    const context = useContext(KioskContext);
    if (context === undefined) {
        throw new Error('useKiosk must be used within a KioskProvider');
    }
    return context;
}
