import { useEffect, useRef, useCallback } from 'react';

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'touchstart', 'keydown', 'scroll', 'click'] as const;
const THROTTLE_MS = 500;

/**
 * Shared activity tracker. Returns a ref with the last activity timestamp
 * and an onActivity callback for additional side effects.
 */
export function useActivityTracker(onActivity?: () => void) {
    const lastActivity = useRef(Date.now());
    const throttleRef = useRef(0);

    const handleActivity = useCallback(() => {
        const now = Date.now();
        if (now - throttleRef.current < THROTTLE_MS) return;
        throttleRef.current = now;
        lastActivity.current = now;
        onActivity?.();
    }, [onActivity]);

    useEffect(() => {
        ACTIVITY_EVENTS.forEach(event =>
            window.addEventListener(event, handleActivity, { passive: true })
        );
        return () => {
            ACTIVITY_EVENTS.forEach(event =>
                window.removeEventListener(event, handleActivity)
            );
        };
    }, [handleActivity]);

    return lastActivity;
}
