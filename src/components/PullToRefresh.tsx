import React, { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const THRESHOLD = 70; // px the user must pull before a refresh fires
const MAX_PULL = THRESHOLD + 30;

interface Props {
    onRefresh: () => Promise<void> | void;
    className?: string;
    style?: React.CSSProperties;
    children: React.ReactNode;
}

// Touch pull-to-refresh wrapper. The wrapper itself is the scroll container so
// the gesture only arms when already scrolled to the top.
export function PullToRefresh({ onRefresh, className, style, children }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const startY = useRef<number | null>(null);
    const [pull, setPull] = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    const onTouchStart = (e: React.TouchEvent) => {
        const el = containerRef.current;
        if (!el || el.scrollTop > 0 || refreshing) {
            startY.current = null;
            return;
        }
        startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: React.TouchEvent) => {
        if (startY.current === null) return;
        const dy = e.touches[0].clientY - startY.current;
        if (dy > 0) setPull(Math.min(dy * 0.5, MAX_PULL));
    };

    const onTouchEnd = async () => {
        if (startY.current === null) return;
        const shouldRefresh = pull >= THRESHOLD;
        startY.current = null;
        if (!shouldRefresh) {
            setPull(0);
            return;
        }
        setRefreshing(true);
        setPull(THRESHOLD);
        try {
            await onRefresh();
        } finally {
            setRefreshing(false);
            setPull(0);
        }
    };

    return (
        <div
            ref={containerRef}
            className={className}
            style={style}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            <div
                className="flex items-center justify-center overflow-hidden transition-[height] duration-150"
                style={{ height: pull }}
            >
                <RefreshCw
                    className={`w-6 h-6 text-blue-500 ${refreshing ? 'animate-spin' : ''}`}
                    style={{ opacity: Math.min(1, pull / THRESHOLD) }}
                />
            </div>
            {children}
        </div>
    );
}
