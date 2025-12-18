import React from 'react';
import { ClockWidget } from '../../components/widgets/ClockWidget';
import { WeatherWidget } from '../../components/widgets/WeatherWidget';
import { AgendaWidget } from '../../components/widgets/AgendaWidget';
import { TrashWidget } from '../../components/widgets/TrashWidget';
import { CountdownWidget } from '../../components/widgets/CountdownWidget';
import { WeekWidget } from '../../components/widgets/WeekWidget';

export const Home: React.FC = () => {
    return (
        <div className="grid grid-cols-2 grid-rows-[auto_1fr_auto] gap-4 h-full">
            {/* Top Row: Clock & Weather */}
            <div className="h-40">
                <ClockWidget />
            </div>
            <div className="h-40">
                <WeatherWidget />
            </div>

            {/* Middle Row: Agenda & Week View */}
            <div className="row-span-1 overflow-hidden">
                <AgendaWidget />
            </div>
            <div className="row-span-1 overflow-hidden">
                <WeekWidget />
            </div>

            {/* Bottom Row: Trash & Countdown */}
            <div className="h-48">
                <TrashWidget />
            </div>
            <div className="h-48">
                <CountdownWidget />
            </div>
        </div>
    );
};

export default Home;
