import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { ClipboardList, Lock, Unlock, Settings as SettingsIcon, Calendar, LayoutDashboard, GraduationCap, ClipboardCheck, Home, RefreshCw, WifiOff, Trophy, Sun, Moon, Clock, Music, Droplets, Wrench } from 'lucide-react';
import { useKiosk } from '../../contexts/KioskContext';
import { getApiUrl } from '../../utils/api';
import { useSecurity } from '../../contexts/SecurityContext';
import clsx from 'clsx';
import { useIdleRedirect } from '../../hooks/useIdleRedirect';
import { useTheme } from '../../hooks/useTheme';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import pkg from '../../../package.json';
import { DoorbellOverlay } from '../overlays/DoorbellOverlay';
import { Screensaver, ScreensaverMode } from '../overlays/Screensaver';
import { OnScreenKeyboard } from '../overlays/OnScreenKeyboard';
import { useConfig } from '../../contexts/ConfigContext';
import { ErrorBoundary } from '../ErrorBoundary';
import { NoteBanner } from '../widgets/NoteBanner';

const SCREENSAVER_NIGHT_IDLE_MS = 180000; // 3 minutes (clock screensaver fallback)
const SCREENSAVER_CHECK_INTERVAL = 10000; // 10 seconds
const IDLE_REDIRECT_MS = 180000; // 3 minutes

export const MainLayout: React.FC = () => {
    const { isLocked, lock, lastActivity } = useKiosk();
    const { deviceId } = useSecurity();
    const { config } = useConfig();
    const [serverIp, setServerIp] = React.useState<string>('');
    const [serverUser, setServerUser] = React.useState<string>('');
    const [showScreensaver, setShowScreensaver] = React.useState(false);
    const [screensaverMode, setScreensaverMode] = React.useState<ScreensaverMode>('clock');
    const isOnline = useOnlineStatus();
    const { isDark, toggleTheme } = useTheme();

    React.useEffect(() => {
        const fetchIp = async () => {
            try {
                const res = await fetch(`${getApiUrl()}/api/system/ip`, {
                    headers: { 'x-device-id': deviceId }
                });
                const data = await res.json();
                setServerIp(data.ip);
                if (data.user) setServerUser(data.user);
            } catch (e) {
                console.error("Failed to fetch server IP", e);
            }
        };
        fetchIp();
    }, [deviceId]);

    // Dismiss screensaver on any activity, but ignore taps that originate
    // inside an interactive screensaver widget (e.g. cat care). Without this
    // guard, a tap on the cat icon would dismiss the screensaver and the
    // synthesised click would land on the nav button beneath it (Admin /
    // Haushalt), navigating the user away unintentionally.
    React.useEffect(() => {
        const dismiss = (e: Event) => {
            const target = e.target as HTMLElement | null;
            if (target && target.closest('[data-screensaver-action]')) return;
            setShowScreensaver(false);
        };
        const events = ['mousedown', 'touchstart', 'keydown'] as const;
        events.forEach(e => window.addEventListener(e, dismiss, { passive: true }));
        return () => { events.forEach(e => window.removeEventListener(e, dismiss)); };
    }, []);

    // Screensaver Logic Check
    //
    // Two independent screensavers can be enabled:
    //   • Night (clock):  active inside the configured start/end window
    //   • Day  (photos):  active outside that window, when an iCloud album is set
    // Each has its own idle threshold so the photo slideshow can kick in earlier
    // during the day than the blackout clock at night.
    React.useEffect(() => {
        const checkScreensaver = () => {
            const cfg = config.screensaver;
            const nightEnabled = !!cfg?.enabled;
            const photoEnabled = !!cfg?.photoEnabled && !!cfg?.photoAlbumUrl;

            if (!nightEnabled && !photoEnabled) {
                setShowScreensaver(false);
                return;
            }

            const now = new Date();
            const nowMinutes = now.getHours() * 60 + now.getMinutes();

            const [startH, startM] = (cfg?.start || "22:00").split(':').map(Number);
            const [endH, endM] = (cfg?.end || "06:00").split(':').map(Number);
            const startTotal = startH * 60 + startM;
            const endTotal = endH * 60 + endM;

            let inNightWindow = false;
            if (startTotal > endTotal) {
                inNightWindow = nowMinutes >= startTotal || nowMinutes < endTotal;
            } else {
                inNightWindow = nowMinutes >= startTotal && nowMinutes < endTotal;
            }

            const idleMs = Date.now() - lastActivity.current;

            if (inNightWindow && nightEnabled) {
                if (idleMs > SCREENSAVER_NIGHT_IDLE_MS) {
                    setScreensaverMode('clock');
                    setShowScreensaver(true);
                } else {
                    setShowScreensaver(false);
                }
                return;
            }

            if (!inNightWindow && photoEnabled) {
                const photoIdleMs = Math.max(1, cfg?.photoIdleMinutes ?? 5) * 60 * 1000;
                if (idleMs > photoIdleMs) {
                    setScreensaverMode('photos');
                    setShowScreensaver(true);
                } else {
                    setShowScreensaver(false);
                }
                return;
            }

            setShowScreensaver(false);
        };

        const interval = setInterval(checkScreensaver, SCREENSAVER_CHECK_INTERVAL);
        checkScreensaver();

        return () => clearInterval(interval);
    }, [config.screensaver, lastActivity]);


    useIdleRedirect(IDLE_REDIRECT_MS, '/');

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Heute' },
        { path: '/status', icon: Calendar, label: 'Woche' },
        { path: '/chores', icon: ClipboardCheck, label: 'Aufgaben' },
        { path: '/rewards', icon: Trophy, label: 'Sterne' },
        { path: '/school', icon: GraduationCap, label: 'Schule' },
        { path: '/notes', icon: ClipboardList, label: 'Notizen' },
        { path: '/smarthome', icon: Home, label: 'SmartHome' },
        { path: '/sonos', icon: Music, label: 'Sonos' },
        { path: '/bathroom', icon: Droplets, label: 'Bad' },
        { path: '/household', icon: Wrench, label: 'Haushalt' },
    ];

    // Doorbell & Keyboard Logic
    const [doorbellActive, setDoorbellActive] = React.useState(false);
    const [doorbellTs, setDoorbellTs] = React.useState<number | undefined>(undefined);
    const [keyboardActive, setKeyboardActive] = React.useState(false);

    React.useEffect(() => {
        // EventSource cannot send custom headers, so we put the deviceId in
        // the path — query strings get stripped by some reverse proxies on
        // long-lived EventSource requests, which silently 401s every client.
        if (!deviceId) return;
        const url = `${getApiUrl()}/api/stream/events/${encodeURIComponent(deviceId)}`;
        console.log("Connecting to SSE:", url);
        const eventSource = new EventSource(url);

        eventSource.onopen = () => {
            // console.log("SSE Connected");
        };

        eventSource.onerror = (err) => {
            console.warn("SSE error:", err);
        };

        eventSource.addEventListener('doorbell', (e: MessageEvent) => {
            console.log("DOORBELL RINGING!");
            try {
                const data = e.data ? JSON.parse(e.data) : {};
                setDoorbellTs(typeof data.timestamp === 'number' ? data.timestamp : Date.now());
            } catch {
                setDoorbellTs(Date.now());
            }
            // Wake the dashboard from any screensaver and reset the idle timer
            // so the screensaver doesn't immediately reappear behind the popup.
            setShowScreensaver(false);
            lastActivity.current = Date.now();
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

        return () => {
            eventSource.close();
        };
    }, [deviceId]);

    return (
        <div className="app-shell flex flex-col h-screen w-full bg-slate-100 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden relative transition-colors duration-200">
            <DoorbellOverlay
                active={doorbellActive}
                eventTimestamp={doorbellTs}
                onClose={() => {
                    setDoorbellActive(false);
                    // Treat dismissal as activity so the screensaver
                    // doesn't pop back immediately.
                    lastActivity.current = Date.now();
                }}
            />
            <Screensaver active={showScreensaver} mode={screensaverMode} onDismiss={() => setShowScreensaver(false)} />

            {keyboardActive && <OnScreenKeyboard onClose={() => setKeyboardActive(false)} />}

            {/* Header / Status Bar */}
            <header className="app-header flex-none h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 transition-colors duration-200">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="text-xl font-bold bg-gradient-to-r from-blue-500 to-teal-500 dark:from-blue-400 dark:to-teal-400 bg-clip-text text-transparent flex-shrink-0">
                        FamilyHub
                    </div>
                    <NoteBanner />
                </div>
                <div className="flex items-center space-x-4">
                    {!isLocked && (
                        <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                            {serverUser && <>{serverUser}@</>}{serverIp}
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
            <nav className="app-nav flex-none h-20 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex transition-colors duration-200">
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
