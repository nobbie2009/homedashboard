import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { ClipboardList, Lock, Unlock, Settings as SettingsIcon, Calendar, LayoutDashboard, GraduationCap, ClipboardCheck, Home, RefreshCw, WifiOff } from 'lucide-react';
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
    const { config } = useConfig();
    const [serverIp, setServerIp] = React.useState<string>('');
    const [showScreensaver, setShowScreensaver] = React.useState(false);
    const [isOnline, setIsOnline] = React.useState(navigator.onLine);

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
                // cross midnight (e.g. 22:00 - 06:00)
                inWindow = nowMinutes >= startTotal || nowMinutes < endTotal;
            } else {
                // same day (e.g. 08:00 - 18:00)
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
        checkScreensaver(); // Check immediately on mount/update

        return () => clearInterval(interval);
    }, [config.screensaver]);


    useIdleRedirect(IDLE_REDIRECT_MS, '/');

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Heute' },
        { path: '/status', icon: Calendar, label: 'Woche' }, // Renamed from "Diese Woche" for space
        { path: '/chores', icon: ClipboardCheck, label: 'Aufgaben' },
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
            // console.error("SSE Error");
            // Browser auto-retries, but we logs silent to avoid spam
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, []);

    return (
        <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 overflow-hidden relative">
            <DoorbellOverlay active={doorbellActive} onClose={() => setDoorbellActive(false)} />
            <Screensaver active={showScreensaver} onDismiss={() => setShowScreensaver(false)} />

            {/* On-Screen Keyboard Overlay */}
            {keyboardActive && <OnScreenKeyboard onClose={() => setKeyboardActive(false)} />}


            {/* Header / Status Bar */}
            <header className="flex-none h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6">
                <div className="text-xl font-bold bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">
                    FamilyHub
                </div>
                <div className="flex items-center space-x-4">
                    {/* Server IP (Only visible if unlocked) */}
                    {!isLocked && (
                        <div className="text-xs text-slate-500 font-mono">
                            IP: {serverIp}
                        </div>
                    )}

                    {/* Version */}
                    <div className="text-[10px] text-slate-500 font-mono opacity-60">
                        v{pkg.version}-{import.meta.env.VITE_GIT_COMMIT_HASH}
                    </div>

                    {/* Offline-Anzeige */}
                    {!isOnline && (
                        <div className="flex items-center space-x-1 text-red-400 text-xs font-medium bg-red-900/30 px-2 py-1 rounded-full border border-red-800/50">
                            <WifiOff className="w-4 h-4" />
                            <span>Kein Internet</span>
                        </div>
                    )}

                    {/* Seite aktualisieren */}
                    <button
                        onClick={() => window.location.reload()}
                        className="p-2 rounded-full hover:bg-slate-800 transition-colors"
                        title="Seite aktualisieren"
                    >
                        <RefreshCw className="w-5 h-5 text-slate-400 hover:text-slate-200" />
                    </button>

                    <button
                        onClick={isLocked ? undefined : lock}
                        className="p-2 rounded-full hover:bg-slate-800 transition-colors"
                    >
                        {isLocked ? <Lock className="w-5 h-5 text-red-400" /> : <Unlock className="w-5 h-5 text-green-400" />}
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-auto p-4 relative">
                <ErrorBoundary>
                    <Outlet />
                </ErrorBoundary>
            </main>

            {/* Bottom Navigation (Large Tabs) */}
            <nav className="flex-none h-20 bg-slate-900 border-t border-slate-800 flex">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => clsx(
                            "flex-1 flex flex-col items-center justify-center space-y-1 transition-all duration-200 active:scale-95",
                            isActive
                                ? "bg-slate-800 text-blue-400 border-t-4 border-blue-400"
                                : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                        )}
                    >
                        <item.icon className="w-8 h-8" />
                        <span className="text-sm font-medium">{item.label}</span>
                    </NavLink>
                ))}
                {/* Admin Link - only visible if unlocked? Or always visible but protected? */}
                <NavLink
                    to="/admin"
                    className={({ isActive }) => clsx(
                        "flex-none w-20 flex flex-col items-center justify-center space-y-1 transition-all duration-200 border-l border-slate-800",
                        isActive
                            ? "bg-slate-800 text-amber-400"
                            : "text-slate-500 hover:bg-slate-800/50 hover:text-slate-300"
                    )}
                >
                    <SettingsIcon className="w-6 h-6" />
                    <span className="text-xs">Admin</span>
                </NavLink>
            </nav>
        </div>
    );
};
