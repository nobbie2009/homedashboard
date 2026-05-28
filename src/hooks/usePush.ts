import { useCallback, useEffect, useState } from 'react';
import { useSecurity } from '../contexts/SecurityContext';
import { getApiUrl } from '../utils/api';

const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    // Back the array with a concrete ArrayBuffer so the type satisfies BufferSource.
    const output = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
    return output;
}

// Manages the device's Web Push subscription against the backend.
export function usePush() {
    const { deviceId } = useSecurity();
    const API_URL = getApiUrl();
    const [subscribed, setSubscribed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [permission, setPermission] = useState<NotificationPermission>(
        supported ? Notification.permission : 'denied'
    );

    useEffect(() => {
        if (!supported) return;
        navigator.serviceWorker.ready
            .then(reg => reg.pushManager.getSubscription())
            .then(sub => setSubscribed(!!sub))
            .catch(() => {});
    }, []);

    const subscribe = useCallback(async () => {
        if (!supported) return;
        setBusy(true);
        try {
            const perm = await Notification.requestPermission();
            setPermission(perm);
            if (perm !== 'granted') return;

            const reg = await navigator.serviceWorker.ready;
            const keyRes = await fetch(`${API_URL}/api/push/vapid-public-key`, {
                headers: { 'x-device-id': deviceId },
            });
            const { key } = await keyRes.json();

            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(key),
            });

            await fetch(`${API_URL}/api/push/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
                body: JSON.stringify({ subscription: sub }),
            });
            setSubscribed(true);
        } catch (e) {
            console.error('Push subscribe failed', e);
        } finally {
            setBusy(false);
        }
    }, [API_URL, deviceId]);

    const unsubscribe = useCallback(async () => {
        if (!supported) return;
        setBusy(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) await sub.unsubscribe();
            await fetch(`${API_URL}/api/push/unsubscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
            });
            setSubscribed(false);
        } catch (e) {
            console.error('Push unsubscribe failed', e);
        } finally {
            setBusy(false);
        }
    }, [API_URL, deviceId]);

    const sendTest = useCallback(async () => {
        try {
            await fetch(`${API_URL}/api/push/test`, {
                method: 'POST',
                headers: { 'x-device-id': deviceId },
            });
        } catch (e) {
            console.error('Push test failed', e);
        }
    }, [API_URL, deviceId]);

    return { supported, subscribed, busy, permission, subscribe, unsubscribe, sendTest };
}
