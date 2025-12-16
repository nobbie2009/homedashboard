import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface KioskContextType {
    isLocked: boolean;
    unlock: (pin: string) => boolean;
    lock: () => void;
    resetIdleTimer: () => void;
}

const KioskContext = createContext<KioskContextType | undefined>(undefined);

// TODO: Move PIN to configuration service later
// For now, hardcoded: '1234'
const ADMIN_PIN = '1234';
const IDLE_TIMEOUT_MS = 60000; // 1 minute for testing, can be increased

export function KioskProvider({ children }: { children: React.ReactNode }) {
    const [isLocked, setIsLocked] = useState(true); // Default to locked
    const [lastInteraction, setLastInteraction] = useState(Date.now());

    const unlock = useCallback((pin: string) => {
        if (pin === ADMIN_PIN) {
            setIsLocked(false);
            resetIdleTimer();
            return true;
        }
        return false;
    }, []);

    const lock = useCallback(() => {
        setIsLocked(true);
    }, []);

    const resetIdleTimer = useCallback(() => {
        setLastInteraction(Date.now());
    }, []);

    // Idle check effect
    useEffect(() => {
        if (isLocked) return;

        const interval = setInterval(() => {
            if (Date.now() - lastInteraction > IDLE_TIMEOUT_MS) {
                lock();
            }
        }, 5000); // Check every 5 seconds

        return () => clearInterval(interval);
    }, [isLocked, lastInteraction, lock]);

    // Global event listeners for activity
    useEffect(() => {
        const handleActivity = () => {
            if (!isLocked) {
                resetIdleTimer();
            }
        };

        window.addEventListener('touchstart', handleActivity);
        window.addEventListener('click', handleActivity);
        window.addEventListener('scroll', handleActivity);
        window.addEventListener('mousemove', handleActivity);

        return () => {
            window.removeEventListener('touchstart', handleActivity);
            window.removeEventListener('click', handleActivity);
            window.removeEventListener('scroll', handleActivity);
            window.removeEventListener('mousemove', handleActivity);
        };
    }, [isLocked, resetIdleTimer]);

    return (
        <KioskContext.Provider value={{ isLocked, unlock, lock, resetIdleTimer }}>
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
