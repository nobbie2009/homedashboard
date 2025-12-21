
import React, { useEffect, useState } from 'react';
import { X, Bell } from 'lucide-react';
import { CameraWidget } from '../widgets/CameraWidget';

interface DoorbellOverlayProps {
    active: boolean;
    onClose: () => void;
}

export const DoorbellOverlay: React.FC<DoorbellOverlayProps> = ({ active, onClose }) => {
    const [visible, setVisible] = useState(false);

    // Sync visibility with active prop
    useEffect(() => {
        if (active) {
            setVisible(true);
            // Auto close after 30 seconds
            const timer = setTimeout(() => {
                onClose();
            }, 30000);
            return () => clearTimeout(timer);
        } else {
            const timer = setTimeout(() => setVisible(false), 300); // Wait for fade out
            return () => clearTimeout(timer);
        }
    }, [active, onClose]);

    if (!visible) return null;

    return (
        <div
            className={`fixed inset - 0 z - 50 flex items - center justify - center bg - black / 80 backdrop - blur - sm transition - opacity duration - 300 ${active ? 'opacity-100' : 'opacity-0'} `}
            onClick={onClose}
        >
            <div
                className={`bg - slate - 900 rounded - 3xl overflow - hidden shadow - 2xl border - 4 border - slate - 700 w - [90vw] h - [80vh] relative transform transition - all duration - 300 ${active ? 'scale-100 translate-y-0' : 'scale-95 translate-y-10'} `}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-start">
                    <div className="flex items-center space-x-2 bg-red-600/90 text-white px-4 py-2 rounded-full backdrop-blur-md shadow-lg animate-pulse">
                        <Bell className="w-5 h-5" />
                        <span className="font-bold">Es hat geklingelt!</span>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 bg-white/10 hover:bg-red-600 rounded-full text-white backdrop-blur-md transition-colors"
                    >
                        <X className="w-8 h-8" />
                    </button>
                </div>

                {/* Content - Reusing Camera Widget Logic */}
                <div className="w-full h-full">
                    <iframe
                        src="/api/camera/stream" // Or use the CameraWidget directly? 
                        // Actually, CameraWidget uses snapshots for safety/compatibility.
                        // But for a doorbell we probably want high FPS stream if possible? 
                        // Let's reuse CameraWidget for consistency as it handles retries.
                        className="hidden"
                    />
                    <CameraWidget />
                </div>
            </div>
        </div>
    );
};
