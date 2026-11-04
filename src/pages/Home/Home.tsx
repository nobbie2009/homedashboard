import React from 'react';
import { useConfig } from '../../contexts/ConfigContext';
import { FlightRadarWidget } from '../../components/widgets/FlightRadarWidget';
import { UnifiedHeaderWidget } from '../../components/widgets/UnifiedHeaderWidget';
import { AgendaWidget } from '../../components/widgets/AgendaWidget';
import { CameraWidget } from '../../components/widgets/CameraWidget';
import { RainRadarWidget } from '../../components/widgets/RainRadarWidget';
import { ChoresWidget } from '../../components/widgets/ChoresWidget';

import { CountdownWidget } from '../../components/widgets/CountdownWidget';
import { MoonWidget } from '../../components/widgets/MoonWidget';
import { WeekWidget } from '../../components/widgets/WeekWidget';
import { SonosWidget } from '../../components/widgets/SonosWidget';

/**
 * Untere Kachelreihe. `weight` steuert die Spaltenbreite relativ zueinander —
 * inhaltsreiche Kacheln (Aufgaben, Kamera) bekommen mehr Platz als schmale
 * Statusanzeigen. Abgeschaltete Kacheln fallen komplett heraus, die
 * verbleibenden verteilen die Breite neu; so wird die Reihe nie enger als
 * nötig.
 */
const BOTTOM_WIDGETS = [
    // Kamera ~16:9 bei 12rem Zeilenhöhe; Countdown breit genug für drei
    // Zifferngruppen, Mondphase als schmalste Kachel.
    { key: 'camera', weight: 1.9, render: () => <CameraWidget /> },
    { key: 'countdown', weight: 1.4, render: () => <CountdownWidget /> },
    { key: 'moon', weight: 1.0, render: () => <MoonWidget /> },
    { key: 'chores', weight: 2.1, render: () => <ChoresWidget /> },
    { key: 'sonos', weight: 1.8, render: () => <SonosWidget /> },
    { key: 'flights', weight: 1.8, render: () => <FlightRadarWidget /> },
] as const;

export const Home: React.FC = () => {
    const { config } = useConfig();
    // Ohne Termine heute wäre ein Drittel der Fläche leer — dann darf die
    // Wochenübersicht den Platz übernehmen.
    const [todayEmpty, setTodayEmpty] = React.useState(false);
    const handleTodayEmpty = React.useCallback((empty: boolean) => setTodayEmpty(empty), []);

    const visibility: Record<string, boolean> = {
        camera: config.dashboard?.widgets?.camera !== false,
        countdown: config.dashboard?.widgets?.countdown !== false,
        moon: config.dashboard?.widgets?.moon !== false,
        chores: config.dashboard?.widgets?.chores !== false,
        sonos: config.dashboard?.widgets?.sonos !== false,
        // Bestehender Schalter im Flugradar-Abschnitt bleibt maßgeblich.
        flights: config.flights?.showOnDashboard !== false,
    };

    const bottomWidgets = BOTTOM_WIDGETS.filter(w => visibility[w.key]);
    const bottomColumns = bottomWidgets.map(w => `${w.weight}fr`).join(' ');

    return (
        <div className="grid grid-cols-1 grid-rows-[auto_1fr_auto] gap-4 h-full">
            {/* Kopfzeile: Uhr, Wetter, Warnungen, Datum */}
            <div className="h-40">
                <UnifiedHeaderWidget />
            </div>

            {/* Hauptreihe: Heute | Woche | Regenradar */}
            <div
                className="grid gap-4 overflow-hidden h-full transition-[grid-template-columns] duration-500"
                style={{ gridTemplateColumns: todayEmpty ? '0.65fr 1.6fr 1fr' : '1fr 1.15fr 1fr' }}
            >
                <div className="overflow-hidden">
                    <AgendaWidget onEmptyChange={handleTodayEmpty} />
                </div>
                <div className="overflow-hidden">
                    <WeekWidget />
                </div>
                <div className="overflow-hidden">
                    <RainRadarWidget />
                </div>
            </div>

            {/* Untere Reihe: konfigurierbare Kacheln */}
            {bottomWidgets.length > 0 && (
                <div
                    className="h-48 grid gap-4"
                    style={{ gridTemplateColumns: bottomColumns }}
                >
                    {bottomWidgets.map(widget => (
                        <div key={widget.key} className="overflow-hidden h-full">
                            {widget.render()}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Home;
