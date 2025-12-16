import React from 'react';
import { mockStatus } from '../../services/mockData';
import { Thermometer, Droplets, Wind, Zap, Home as HomeIcon, Lock, Unlock } from 'lucide-react';
import clsx from 'clsx';

const StatusIcon = ({ icon, className }: { icon: string, className?: string }) => {
    switch (icon) {
        case 'thermometer': return <Thermometer className={className} />;
        case 'droplet': return <Droplets className={className} />;
        case 'wind': return <Wind className={className} />;
        case 'zap': return <Zap className={className} />;
        case 'lock': return <Lock className={className} />;
        case 'unlock': return <Unlock className={className} />;
        case 'home': return <HomeIcon className={className} />;
        default: return <HomeIcon className={className} />;
    }
};

const StatusCard = ({ sensor }: { sensor: typeof mockStatus[0] }) => {
    const statusColors = {
        ok: 'bg-slate-800/50 border-slate-700 text-white',
        warning: 'bg-orange-900/20 border-orange-500/50 text-orange-200',
        critical: 'bg-red-900/20 border-red-500/50 text-red-200',
        neutral: 'bg-slate-800/50 border-slate-700 text-slate-300'
    };

    return (
        <div className={clsx("flex items-center p-6 rounded-xl border shadow-lg backdrop-blur-sm", statusColors[sensor.status])}>
            <div className="p-4 rounded-full bg-slate-700/30 mr-4">
                <StatusIcon icon={sensor.icon} className="w-8 h-8" />
            </div>
            <div>
                <div className="text-sm opacity-70 uppercase tracking-widest mb-1">{sensor.name}</div>
                <div className="text-2xl font-bold flex items-baseline">
                    {sensor.value}
                    {sensor.unit && <span className="text-lg ml-1 font-normal opacity-60">{sensor.unit}</span>}
                </div>
            </div>
        </div>
    );
};

const StatusView: React.FC = () => {
    return (
        <div className="h-full flex flex-col">
            <h2 className="text-3xl font-bold mb-6 pl-2 bg-gradient-to-r from-green-400 to-teal-500 bg-clip-text text-transparent">Haus Status</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6 p-2">
                {mockStatus.map(sensor => (
                    <StatusCard key={sensor.id} sensor={sensor} />
                ))}
            </div>

            <div className="mt-8 p-6 bg-slate-900/50 rounded-xl border border-dashed border-slate-700 mx-2 text-center">
                <p className="text-slate-500">
                    Hier könnte eine iFrame-Integration für ein Home Assistant Dashboard stehen.
                </p>
            </div>
        </div>
    );
};

export default StatusView;
