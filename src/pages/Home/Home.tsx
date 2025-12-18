import React from 'react';
import { UnifiedHeaderWidget } from '../../components/widgets/UnifiedHeaderWidget';
import { AgendaWidget } from '../../components/widgets/AgendaWidget';

import { CountdownWidget } from '../../components/widgets/CountdownWidget';
import { WeekWidget } from '../../components/widgets/WeekWidget';

export const Home: React.FC = () => {
    return (
        <div className="grid grid-cols-2 grid-rows-[auto_1fr_auto] gap-4 h-full">
            {/* Top Row: Unified Header */}
            <div className="col-span-2 h-40">
                <UnifiedHeaderWidget />
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
                <CameraWidget />
            </div>
            <div className="h-48">
                <CountdownWidget />
            </div>
        </div>
    );
};

export default Home;
