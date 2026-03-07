import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { ClipboardList, Lock, Unlock, Settings as SettingsIcon, Calendar, LayoutDashboard, GraduationCap, ClipboardCheck, Home, RefreshCw, WifiOff, Trophy, Sun, Moon, Clock } from 'lucide-react';
import { useKiosk } from '../../contexts/KioskContext';
import { getApiUrl } from '../../utils/api';
import { useSecurity } from '../../contexts/SecurityContext';
import clsx from 'clsx';
import { useIdleRedirect } from '../../hooks/useIdleRedirect';
import pkg from '../../../package.json';
import { DoorbellOverlay } from '../overlays/DoorbellOverlay';
import { Screensaver } from '../overlays/Screensaver';
import { OnScreenKeyboard } from '../overlays/OnScreenKeyboard';
import { useConfig } from '../../contexts/ConfigContext';
import { ErrorBoundary } from '../ErrorBoundary';

const SCREENSAVER_IDLE_MS = 180000; // 3 minutes
const SCREENSAVER_CHECK_INTERVAL = 10000; // 10 seconds
const IDLE_REDIRECT_MS = 180000; // 3 minutes

export const MainLayout: React.FC = () => {
    const { isLocked, lock, lastActivity } = useKiosk();
    const { deviceId } = useSecurity();
    const { config, updateConfig } = useConfig();
    const [serverIp, setServerIp] = React.useState<string>('');
    const [showScreensaver, setShowScreensaver] = React.useState(false);
    const [isOnline, setIsOnline] = React.useState(navigator.onLine);

    // Theme management with auto/schedule support
    const [resolvedDark, setResolvedDark] = React.useState(config.theme !== 'light');

    const checkAutoTheme = React.useCallback(() => {
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
            // Overnight: e.g. 20:00 - 07:00
            inDarkWindow = nowMinutes >= startTotal || nowMinutes < endTotal;
        } else {
            inDarkWindow = nowMinutes >= startTotal && nowMinutes < endTotal;
        }
        setResolvedDark(inDarkWindow);
    }, [config.theme, config.themeSchedule]);

    React.useEffect(() => {
        checkAutoTheme();
        const interval = setInterval(checkAutoTheme, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [checkAutoTheme]);

    const isDark = resolvedDark;

    React.useEffect(() => {
        const root = document.documentElement;
        if (isDark) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
    }, [isDark]);

    const toggleTheme = () => {
        // Cycle: dark -> light -> auto -> dark
        const next = config.theme === 'dark' ? 'light' : config.theme === 'light' ? 'auto' : 'dark';
        updateConfig({ theme: next });
    };

    React.useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    React.useEffect(() => {
        const fetchIp = async () => {
            try {
                const res = await fetch(`${getApiUrl()}/api/system/ip`, {
                    headers: { 'x-device-id': deviceId }
                });
                const data = await res.json();
                setServerIp(data.ip);
            } catch (e) {
                console.error("Failed to fetch server IP", e);
            }
        };
        fetchIp();
    }, [deviceId]);

    // Dismiss screensaver on any activity
    React.useEffect(() => {
        const dismiss = () => setShowScreensaver(false);
        const events = ['mousedown', 'touchstart', 'keydown'] as const;
        events.forEach(e => window.addEventListener(e, dismiss, { passive: true }));
        return () => { events.forEach(e => window.removeEventListener(e, dismiss)); };
    }, []);

    // Screensaver Logic Check
    React.useEffect(() => {
        const checkScreensaver = () => {
            if (!config.screensaver?.enabled) return;

            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();

            const [startH, startM] = (config.screensaver.start || "22:00").split(':').map(Number);
            const [endH, endM] = (config.screensaver.end || "06:00").split(':').map(Number);

            const startTotal = startH * 60 + startM;
            const endTotal = endH * 60 + endM;

            let inWindow = false;
            if (startTotal > endTotal) {
                inWindow = nowMinutes >= startTotal || nowMinutes < endTotal;
            } else {
                inWindow = nowMinutes >= startTotal && nowMinutes < endTotal;
            }

            if (inWindow) {
                if (Date.now() - lastActivity.current > SCREENSAVER_IDLE_MS) {
                    setShowScreensaver(true);
                }
            } else {
                setShowScreensaver(false);
            }
        };

        const interval = setInterval(checkScreensaver, SCREENSAVER_CHECK_INTERVAL);
        checkScreensaver();

        return () => clearInterval(interval);
    }, [config.screensaver]);


    useIdleRedirect(IDLE_REDIRECT_MS, '/');

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Heute' },
        { path: '/status', icon: Calendar, label: 'Woche' },
        { path: '/chores', icon: ClipboardCheck, label: 'Aufgaben' },
        { path: '/rewards', icon: Trophy, label: 'Sterne' },
        { path: '/school', icon: GraduationCap, label: 'Schule' },
        { path: '/notes', icon: ClipboardList, label: 'Notizen' },
        { path: '/smarthome', icon: Home, label: 'SmartHome' },
    ];

    // Doorbell & Keyboard Logic
    const [doorbellActive, setDoorbellActive] = React.useState(false);
    const [keyboardActive, setKeyboardActive] = React.useState(false);

    React.useEffect(() => {
        const url = `${getApiUrl()}/api/stream/events`;
        console.log("Connecting to SSE:", url);
        const eventSource = new EventSource(url);

        eventSource.onopen = () => {
            // console.log("SSE Connected");
        };

        eventSource.addEventListener('doorbell', () => {
            console.log("DOORBELL RINGING!");
            setDoorbellActive(true);
        });

        eventSource.addEventListener('keyboard', (e: MessageEvent) => {
            try {
                const data = JSON.parse(e.data);
                console.log("Remote Keyboard Event:", data);
                if (typeof data.active === 'boolean') {
                    setKeyboardActive(data.active);
                }
            } catch (err) {
                console.error("Failed to parse keyboard event", err);
            }
        });

        eventSource.onerror = () => {
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, []);

    return (
        <div className="flex flex-col h-screen w-full bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden relative transition-colors duration-200">
            <DoorbellOverlay active={doorbellActive} onClose={() => setDoorbellActive(false)} />
            <Screensaver active={showScreensaver} onDismiss={() => setShowScreensaver(false)} />

            {keyboardActive && <OnScreenKeyboard onClose={() => setKeyboardActive(false)} />}

            {/* Header / Status Bar */}
            <header className="flex-none h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 transition-colors duration-200">
                <div className="text-xl font-bold bg-gradient-to-r from-blue-500 to-teal-500 dark:from-blue-400 dark:to-teal-400 bg-clip-text text-transparent">
                    FamilyHub
                </div>
                <div className="flex items-center space-x-4">
                    {!isLocked && (
                        <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                            IP: {serverIp}
                        </div>
                    )}

                    <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono opacity-60">
                        v{pkg.version}-{import.meta.env.VITE_GIT_COMMIT_HASH}
                    </div>

                    {!isOnline && (
                        <div className="flex items-center space-x-1 text-red-500 dark:text-red-400 text-xs font-medium bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded-full border border-red-200 dark:border-red-800/50">
                            <WifiOff className="w-4 h-4" />
                            <span>Kein Internet</span>
                        </div>
                    )}

                    {/* Theme Toggle: dark -> light -> auto -> dark */}
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                        title={config.theme === 'auto' ? `Automatisch (${config.themeSchedule?.darkStart || '20:00'}–${config.themeSchedule?.darkEnd || '07:00'})` : isDark ? 'Dunkel (Klick: Hell)' : 'Hell (Klick: Auto)'}
                    >
                        {config.theme === 'auto' ? (
                            <Clock className="w-5 h-5 text-sky-400" />
                        ) : isDark ? (
                            <Sun className="w-5 h-5 text-yellow-400" />
                        ) : (
                            <Moon className="w-5 h-5 text-slate-500" />
                        )}
                    </button>

                    <button
                        onClick={() => window.location.reload()}
                        className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                        title="Seite aktualisieren"
                    >
                        <RefreshCw className="w-5 h-5 text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" />
                    </button>

                    <button
                        onClick={isLocked ? undefined : lock}
                        className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    >
                        {isLocked ? <Lock className="w-5 h-5 text-red-400" /> : <Unlock className="w-5 h-5 text-green-500 dark:text-green-400" />}
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto p-4 relative">
                <ErrorBoundary>
                    <Outlet />
                </ErrorBoundary>
            </main>

            {/* Bottom Navigation */}
            <nav className="flex-none h-20 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex transition-colors duration-200">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => clsx(
                            "flex-1 flex flex-col items-center justify-center space-y-1 transition-all duration-200 active:scale-95",
                            isActive
                                ? "bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-t-4 border-blue-600 dark:border-blue-400"
                                : "text-slate-400 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-600 dark:hover:text-slate-200"
                        )}
                    >
                        <item.icon className="w-8 h-8" />
                        <span className="text-sm font-medium">{item.label}</span>
                    </NavLink>
                ))}
                <NavLink
                    to="/admin"
                    className={({ isActive }) => clsx(
                        "flex-none w-20 flex flex-col items-center justify-center space-y-1 transition-all duration-200 border-l border-slate-200 dark:border-slate-800",
                        isActive
                            ? "bg-slate-100 dark:bg-slate-800 text-amber-500 dark:text-amber-400"
                            : "text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-600 dark:hover:text-slate-300"
                    )}
                >
                    <SettingsIcon className="w-6 h-6" />
                    <span className="text-xs">Admin</span>
                </NavLink>
            </nav>
        </div>
    );
};
