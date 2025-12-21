import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function useIdleRedirect(timeoutMs: number, redirectPath: string) {
    const navigate = useNavigate();
    const location = useLocation();


    useEffect(() => {
        let timer: NodeJS.Timeout;

        const resetTimer = () => {

            clearTimeout(timer);
            // Only set redirect timer if NOT already on home
            if (location.pathname !== redirectPath) {
                timer = setTimeout(() => {
                    console.log("Idle timeout reached. Redirecting to home.");
                    navigate(redirectPath);
                }, timeoutMs);
            }
        };

        // Events to listen for
        const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];

        // Bind listeners
        events.forEach(event => window.addEventListener(event, resetTimer));

        // Initial set
        resetTimer();

        return () => {
            events.forEach(event => window.removeEventListener(event, resetTimer));
            clearTimeout(timer);
        };
    }, [location.pathname, navigate, redirectPath, timeoutMs]);
}
