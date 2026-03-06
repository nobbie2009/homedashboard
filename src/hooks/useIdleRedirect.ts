import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useKiosk } from '../contexts/KioskContext';

export function useIdleRedirect(timeoutMs: number, redirectPath: string) {
    const navigate = useNavigate();
    const location = useLocation();
    const { lastActivity } = useKiosk();

    useEffect(() => {
        if (location.pathname === redirectPath) return;

        const check = setInterval(() => {
            if (Date.now() - lastActivity.current > timeoutMs) {
                console.log("Idle timeout reached. Redirecting to home.");
                navigate(redirectPath);
            }
        }, 5000);

        return () => clearInterval(check);
    }, [location.pathname, navigate, redirectPath, timeoutMs, lastActivity]);
}
