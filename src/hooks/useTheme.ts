import { useCallback, useEffect, useState } from 'react';
import { useConfig } from '../contexts/ConfigContext';

// Resolves the active theme (dark/light/auto+schedule), applies the `dark`
// class to <html> for Tailwind, and exposes a cycling toggle. Shared by the
// kiosk layout and the PWA so both honor the configured theme.
export function useTheme() {
    const { config, updateConfig } = useConfig();
    const [resolvedDark, setResolvedDark] = useState(config.theme !== 'light');

    const checkAutoTheme = useCallback(() => {
        if (config.theme !== 'auto') {
            setResolvedDark(config.theme !== 'light');
            return;
        }
        const schedule = config.themeSchedule || { darkStart: '20:00', darkEnd: '07:00' };
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const [startH, startM] = schedule.darkStart.split(':').map(Number);
        const [endH, endM] = schedule.darkEnd.split(':').map(Number);
        const startTotal = startH * 60 + startM;
        const endTotal = endH * 60 + endM;

        let inDarkWindow: boolean;
        if (startTotal > endTotal) {
            // Overnight window, e.g. 20:00 - 07:00
            inDarkWindow = nowMinutes >= startTotal || nowMinutes < endTotal;
        } else {
            inDarkWindow = nowMinutes >= startTotal && nowMinutes < endTotal;
        }
        setResolvedDark(inDarkWindow);
    }, [config.theme, config.themeSchedule]);

    useEffect(() => {
        checkAutoTheme();
        const interval = setInterval(checkAutoTheme, 60000); // re-evaluate every minute
        return () => clearInterval(interval);
    }, [checkAutoTheme]);

    useEffect(() => {
        const root = document.documentElement;
        if (resolvedDark) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }, [resolvedDark]);

    const toggleTheme = useCallback(() => {
        // Cycle: dark -> light -> auto -> dark
        const next = config.theme === 'dark' ? 'light' : config.theme === 'light' ? 'auto' : 'dark';
        updateConfig({ theme: next });
    }, [config.theme, updateConfig]);

    return { isDark: resolvedDark, theme: config.theme, toggleTheme };
}
