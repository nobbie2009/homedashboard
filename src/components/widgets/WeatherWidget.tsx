import React from 'react';
import { Cloud, CloudRain, Sun, CloudSnow } from 'lucide-react';
import { mockWeather } from '../../services/mockData';

const WeatherIcon = ({ condition, className }: { condition: string, className?: string }) => {
    switch (condition) {
        case 'rain': return <CloudRain className={className} />;
        case 'snow': return <CloudSnow className={className} />;
        case 'cloudy': return <Cloud className={className} />;
        default: return <Sun className={className} />;
    }
};

export const WeatherWidget: React.FC = () => {
    const { temp, condition, forecast } = mockWeather;

    return (
        <div className="flex items-center justify-between p-6 bg-slate-800/50 rounded-xl backdrop-blur-sm shadow-lg w-full h-full border border-slate-700 text-white">
            <div className="flex items-center space-x-4">
                <WeatherIcon condition={condition} className="w-16 h-16 text-yellow-400" />
                <div className="flex flex-col">
                    <span className="text-5xl font-bold">{temp}°</span>
                    <span className="text-slate-400 capitalize">{condition}</span>
                </div>
            </div>

            <div className="flex space-x-6">
                {forecast.map((day, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                        <span className="text-slate-400 text-sm">{day.day}</span>
                        <span className="font-bold my-1">{day.temp}°</span>
                        <WeatherIcon condition={day.icon} className="w-6 h-6 text-slate-300" />
                    </div>
                ))}
            </div>
        </div>
    );
};
