import React from 'react';
import { UnifiedHeaderWidget } from '../../components/widgets/UnifiedHeaderWidget';
import { AgendaWidget } from '../../components/widgets/AgendaWidget';
import { CameraWidget } from '../../components/widgets/CameraWidget';
import { RainRadarWidget } from '../../components/widgets/RainRadarWidget';
import { ChoresWidget } from '../../components/widgets/ChoresWidget';

import { CountdownWidget } from '../../components/widgets/CountdownWidget';
import { WeekWidget } from '../../components/widgets/WeekWidget';

export const Home: React.FC = () => {
    return (
        <div className="grid grid-cols-2 grid-rows-[auto_1fr_auto] gap-4 h-full">
            {/* Top Row: Unified Header */}
            <div className="col-span-2 h-40">
                <UnifiedHeaderWidget />
            </div>

            {/* Middle Row: Agenda (Left) | Week (Center) | Radar (Right) */}
            {/* We need a 3-column grid nested or change the main grid to 3 columns? 
                The main grid is 2 cols. Let's change main grid to 3 cols or use a nested grid spanning 2 cols?
                If we change main to 3 cols, we need to adjust bottom row.
                Let's change main grid to 12 cols for flexibility or just 3 cols.
            */}

            <div className="col-span-2 row-span-1 grid grid-cols-3 gap-4 overflow-hidden h-full">
                {/* Left: Agenda (Today) */}
                <div className="overflow-hidden">
                    <AgendaWidget />
                </div>

                {/* Center: Week Overview */}
                <div className="overflow-hidden">
                    <WeekWidget />
                </div>

                {/* Right: Rain Radar */}
                <div className="overflow-hidden">
                    <RainRadarWidget />
                </div>
            </div>

            {/* Bottom Row: Camera & Countdown */}
            {/* They should share the width. Camera is usually wider? 
                Let's just split them 50/50 for now or Keep existing relative sizes?
                Previous was Camera (Left) | Countdown (Right) in a 2-col grid.
            */}
            {/* Bottom Row: Camera | Countdown | Chores */}
            <div className="col-span-2 h-48 grid grid-cols-[2fr_1fr_2fr] gap-4">
                <div className="overflow-hidden h-full">
                    <CameraWidget />
                </div>
                <div className="overflow-hidden h-full">
                    <CountdownWidget />
                </div>
                <div className="overflow-hidden h-full">
                    <ChoresWidget />
                </div>
            </div>
        </div>
    );
};

export default Home;
