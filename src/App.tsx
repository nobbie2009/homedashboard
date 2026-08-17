// import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { KioskProvider } from './contexts/KioskContext';
import { ConfigProvider } from './contexts/ConfigContext';
import { MainLayout } from './components/layout/MainLayout';
import {
    Dashboard,
    NotesBoard,
    StatusView,
    SchoolView,
    ChoresView,
    RewardBoard,
    SmartHomeView,
    SonosView,
    SpotifyView,
    AdminSettings,
    BathroomView,
    HouseholdView,
    FlightsView,
    PwaApp
} from './pages';

// Task List:
// - [x] Create SmartHome view for Home Assistant <!-- id: 5 -->
// - [/] Implement Edupage display in SchoolView <!-- id: 6 -->
// - [/] Update Navigation/Routing <!-- id: 7 -->

import { SecurityProvider, useSecurity } from './contexts/SecurityContext';
import AccessDenied from './pages/AccessDenied';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';

function SecurityGate({ children }: { children: React.ReactNode }) {
    const { deviceStatus } = useSecurity();

    // If approved, show app
    if (deviceStatus === 'approved') {
        return <>{children}</>;
    }

    // Otherwise show Access Denied / Pending
    // We pass deviceId/Status via context, but AccessDenied uses the hook too.
    return <AccessDenied />;
}

function App() {
    return (
        <>
        <PwaUpdatePrompt />
        <SecurityProvider>
            <ConfigProvider>
                <KioskProvider>
                    <SecurityGate>
                        <BrowserRouter>
                            <Routes>
                                <Route path="/pwa" element={<PwaApp />} />
                                <Route path="/" element={<MainLayout />}>
                                    <Route index element={<Dashboard />} />
                                    <Route path="notes" element={<NotesBoard />} />
                                    <Route path="status" element={<StatusView />} />
                                    <Route path="school" element={<SchoolView />} />
                                    <Route path="chores" element={<ChoresView />} />
                                    <Route path="rewards" element={<RewardBoard />} />
                                    <Route path="smarthome" element={<SmartHomeView />} />
                                    <Route path="sonos" element={<SonosView />} />
                                    <Route path="spotify" element={<SpotifyView />} />
                                    <Route path="bathroom" element={<BathroomView />} />
                                    <Route path="household" element={<HouseholdView />} />
                                    <Route path="flights" element={<FlightsView />} />
                                    <Route path="admin" element={<AdminSettings />} />
                                    <Route path="*" element={<Navigate to="/" replace />} />
                                </Route>
                            </Routes>
                        </BrowserRouter>
                    </SecurityGate>
                </KioskProvider>
            </ConfigProvider>
        </SecurityProvider>
        </>
    );
}

export default App;
