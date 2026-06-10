import React, { useState, useEffect, useRef } from 'react';
import { VideoOff, RefreshCw } from 'lucide-react';
import { useConfig } from '../../contexts/ConfigContext';
import { getApiUrl } from '../../utils/api';
import { useSecurity } from '../../contexts/SecurityContext';

// The MJPEG stream is consumed via fetch instead of a plain <img src>:
// a multipart <img> never fires an error when the connection stalls, so a
// nightly camera reboot used to freeze the widget on the last (night) frame.
// Reading the bytes ourselves lets us detect a stalled stream and reconnect.
const CHUNK_TIMEOUT = 10000;        // no stream data for 10s -> stale, reconnect
const WATCHDOG_INTERVAL = 2000;
const RETRY_BASE_DELAY = 2000;
const MAX_RETRY_DELAY = 15000;
const MAX_STREAM_FAILURES = 3;      // then fall back to snapshot polling
const STREAM_RETRY_INTERVAL = 60000; // while polling snapshots, retry stream after 60s
const SNAPSHOT_INTERVAL = 1000;
const SNAPSHOT_ERROR_DELAY = 3000;
const MAX_BUFFER_BYTES = 4_000_000;

type CameraStatus = 'connecting' | 'live' | 'snapshot' | 'reconnecting';

const JPEG_START = [0xff, 0xd8];
const JPEG_END = [0xff, 0xd9];

function findMarker(buf: Uint8Array, marker: number[], from: number): number {
    for (let i = from; i <= buf.length - marker.length; i++) {
        if (buf[i] === marker[0] && buf[i + 1] === marker[1]) return i;
    }
    return -1;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const CameraWidget: React.FC = () => {
    const { config } = useConfig();
    const { deviceId } = useSecurity();
    const API_URL = getApiUrl();
    const [frameUrl, setFrameUrl] = useState<string | null>(null);
    const [status, setStatus] = useState<CameraStatus>('connecting');
    const lastUrlRef = useRef<string | null>(null);

    useEffect(() => {
        if (!config.cameraUrl || !deviceId) return;

        let disposed = false;
        let controller: AbortController | null = null;
        let mode: 'stream' | 'snapshot' = 'stream';
        let failCount = 0;

        const showFrame = (blob: Blob) => {
            if (disposed) return;
            const url = URL.createObjectURL(blob);
            if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
            lastUrlRef.current = url;
            setFrameUrl(url);
        };

        const runStream = async (): Promise<void> => {
            while (!disposed && mode === 'stream') {
                controller = new AbortController();
                let lastData = Date.now();
                const watchdog = setInterval(() => {
                    if (Date.now() - lastData > CHUNK_TIMEOUT) {
                        console.warn('Camera stream stalled on client, reconnecting');
                        controller?.abort();
                    }
                }, WATCHDOG_INTERVAL);

                try {
                    const res = await fetch(`${API_URL}/api/camera/stream?deviceId=${encodeURIComponent(deviceId)}`, {
                        headers: { 'x-device-id': deviceId },
                        cache: 'no-store',
                        signal: controller.signal
                    });
                    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

                    const reader = res.body.getReader();
                    let buf = new Uint8Array(0);

                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) throw new Error('stream ended');
                        lastData = Date.now();

                        const merged = new Uint8Array(buf.length + value.length);
                        merged.set(buf);
                        merged.set(value, buf.length);
                        buf = merged;

                        // Extract complete JPEG frames (SOI ... EOI)
                        // eslint-disable-next-line no-constant-condition
                        while (true) {
                            const start = findMarker(buf, JPEG_START, 0);
                            if (start === -1) break;
                            const end = findMarker(buf, JPEG_END, start + 2);
                            if (end === -1) break;
                            const frame = buf.slice(start, end + 2);
                            buf = buf.slice(end + 2);
                            showFrame(new Blob([frame], { type: 'image/jpeg' }));
                            failCount = 0;
                            setStatus('live');
                        }

                        if (buf.length > MAX_BUFFER_BYTES) buf = new Uint8Array(0);
                    }
                } catch {
                    /* fall through to retry logic */
                } finally {
                    clearInterval(watchdog);
                    controller = null;
                }

                if (disposed) return;
                failCount++;
                setStatus('reconnecting');

                if (failCount >= MAX_STREAM_FAILURES) {
                    mode = 'snapshot';
                    void runSnapshots();
                    return;
                }
                await sleep(Math.min(RETRY_BASE_DELAY * failCount, MAX_RETRY_DELAY));
            }
        };

        const runSnapshots = async (): Promise<void> => {
            const since = Date.now();
            while (!disposed && mode === 'snapshot') {
                try {
                    const res = await fetch(`${API_URL}/api/camera/snapshot?deviceId=${encodeURIComponent(deviceId)}&t=${Date.now()}`, {
                        headers: { 'x-device-id': deviceId },
                        cache: 'no-store'
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const blob = await res.blob();
                    if (blob.size > 0) {
                        showFrame(blob);
                        setStatus('snapshot');
                    }
                    await sleep(SNAPSHOT_INTERVAL);
                } catch {
                    if (disposed) return;
                    setStatus('reconnecting');
                    await sleep(SNAPSHOT_ERROR_DELAY);
                }

                // Periodically try to get back to the much smoother live stream
                if (Date.now() - since > STREAM_RETRY_INTERVAL) {
                    mode = 'stream';
                    failCount = 0;
                    void runStream();
                    return;
                }
            }
        };

        // When the network comes back (e.g. after the nightly reboot of the
        // router/server), don't wait for the backoff timer.
        const onOnline = () => controller?.abort();
        window.addEventListener('online', onOnline);

        setStatus('connecting');
        void runStream();

        return () => {
            disposed = true;
            window.removeEventListener('online', onOnline);
            controller?.abort();
            if (lastUrlRef.current) {
                URL.revokeObjectURL(lastUrlRef.current);
                lastUrlRef.current = null;
            }
        };
    }, [config.cameraUrl, deviceId, API_URL]);

    if (!config.cameraUrl) {
        return (
            <div className="h-full widget-card bg-slate-200/20 dark:bg-slate-800/20 rounded-xl border border-slate-300/30 dark:border-slate-700/30 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600">
                <VideoOff className="w-8 h-8 mb-2 opacity-50" />
                <span className="text-sm italic">Keine Kamera konfiguriert</span>
            </div>
        );
    }

    return (
        <div className="h-full w-full media-card bg-black rounded-xl overflow-hidden relative group border border-slate-200 dark:border-slate-800">
            {frameUrl ? (
                <img
                    src={frameUrl}
                    alt="Kamera"
                    className={`w-full h-full object-cover transition-opacity duration-300 ${status === 'reconnecting' ? 'opacity-50' : 'opacity-100'}`}
                />
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                    <RefreshCw className="w-6 h-6 mb-2 animate-spin" />
                    <span className="text-xs">Kamera wird verbunden…</span>
                </div>
            )}

            {status === 'reconnecting' && frameUrl && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                    <RefreshCw className="w-6 h-6 mb-2 animate-spin text-white/90" />
                    <span className="text-xs text-white/90 font-medium">Verbindung wird wiederhergestellt…</span>
                </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="text-xs text-white/80 font-medium ml-1">
                    {status === 'live' ? 'Live-Stream' : status === 'snapshot' ? 'Snapshot-Modus' : status === 'connecting' ? 'Verbinde…' : 'Neuverbindung…'}
                </span>
            </div>
        </div>
    );
};
