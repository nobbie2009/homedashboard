import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        // iOS Safari
        (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
}

function isIosDevice(): boolean {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

// Exposes installability: a native prompt on Android/Chrome, or a flag telling
// the UI to show manual "Add to Home Screen" instructions on iOS Safari.
export function usePwaInstall() {
    const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
    const [installed, setInstalled] = useState(isStandalone());

    useEffect(() => {
        const onPrompt = (e: Event) => {
            e.preventDefault();
            setDeferred(e as BeforeInstallPromptEvent);
        };
        const onInstalled = () => {
            setInstalled(true);
            setDeferred(null);
        };
        window.addEventListener('beforeinstallprompt', onPrompt);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onPrompt);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    const promptInstall = useCallback(async () => {
        if (!deferred) return;
        await deferred.prompt();
        await deferred.userChoice;
        setDeferred(null);
    }, [deferred]);

    return {
        canInstall: !!deferred && !installed,
        needsIosHint: isIosDevice() && !installed,
        installed,
        promptInstall,
    };
}
