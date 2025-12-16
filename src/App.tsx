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
    AdminSettings
} from './pages';

function App() {
    return (
        <KioskProvider>
            <ConfigProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<MainLayout />}>
                            <Route index element={<Dashboard />} />
                            <Route path="notes" element={<NotesBoard />} />
                            <Route path="status" element={<StatusView />} />
                            <Route path="school" element={<SchoolView />} />
                            <Route path="admin" element={<AdminSettings />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Route>
                    </Routes>
                </BrowserRouter>
            </ConfigProvider>
        </KioskProvider>
    );
}

export default App;
