import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { ClipboardList, Lock, Unlock, Settings as SettingsIcon, Calendar, LayoutDashboard, GraduationCap, ClipboardCheck, Home } from 'lucide-react';
import { useKiosk } from '../../contexts/KioskContext';
import { getApiUrl } from '../../utils/api';
import { useSecurity } from '../../contexts/SecurityContext';
import clsx from 'clsx';
import { useIdleRedirect } from '../../hooks/useIdleRedirect';
import pkg from '../../../package.json';

export const MainLayout: React.FC = () => {
    const { isLocked, lock } = useKiosk();
    const { deviceId } = useSecurity();
    const [serverIp, setServerIp] = React.useState<string>('');

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

    // Auto-redirect to home after 3 minutes (180000ms) of inactivity
    useIdleRedirect(180000, '/');

    const navItems = [
        { path: '/', icon: LayoutDashboard, label: 'Heute' },
        { path: '/status', icon: Calendar, label: 'Woche' }, // Renamed from "Diese Woche" for space
        { path: '/chores', icon: ClipboardCheck, label: 'Aufgaben' },
        { path: '/school', icon: GraduationCap, label: 'Schule' },
        { path: '/notes', icon: ClipboardList, label: 'Notizen' },
        { path: '/smarthome', icon: Home, label: 'SmartHome' },
    ];

    return (
        <div className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 overflow-hidden">
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
                        v{pkg.version}
                    </div>

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
                <Outlet />
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
