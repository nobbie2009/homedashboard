import React from 'react';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    willReload: boolean;
}

// If the same crash recurs within this window after an automatic reload, we
// assume reloading won't help and stop the loop, leaving the error on screen.
const RELOAD_COOLDOWN_MS = 60_000;
const RELOAD_DELAY_MS = 5_000;
const LAST_RELOAD_KEY = 'homedashboard_last_crash_reload';

// Top-level boundary for the kiosk: if the React tree throws during render,
// the whole app would otherwise unmount and leave a blank white page that
// never recovers on its own (the Pi runs the same session for days). Here we
// reload the page automatically so the dashboard heals itself.
export class RootErrorBoundary extends React.Component<Props, State> {
    private reloadTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, willReload: false };
    }

    static getDerivedStateFromError(): Partial<State> {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('RootErrorBoundary caught:', error, errorInfo);

        let lastReload = 0;
        try {
            lastReload = Number(sessionStorage.getItem(LAST_RELOAD_KEY)) || 0;
        } catch {}

        const now = Date.now();
        if (now - lastReload < RELOAD_COOLDOWN_MS) {
            // Crash reproduced right after a reload — break the loop.
            return;
        }

        try {
            sessionStorage.setItem(LAST_RELOAD_KEY, String(now));
        } catch {}

        this.setState({ willReload: true });
        this.reloadTimer = setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
    }

    componentWillUnmount() {
        if (this.reloadTimer) clearTimeout(this.reloadTimer);
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1rem',
                    background: '#0f172a',
                    color: '#e2e8f0',
                    fontFamily: 'system-ui, sans-serif',
                    textAlign: 'center',
                    padding: '2rem',
                }}
            >
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    Etwas ist schiefgelaufen
                </div>
                <div style={{ color: '#94a3b8' }}>
                    {this.state.willReload
                        ? 'Die Seite wird automatisch neu geladen…'
                        : 'Automatischer Neustart hat nicht geholfen.'}
                </div>
                <button
                    onClick={() => window.location.reload()}
                    style={{
                        marginTop: '0.5rem',
                        padding: '0.6rem 1.4rem',
                        fontSize: '1rem',
                        borderRadius: '9999px',
                        border: 'none',
                        background: '#2563eb',
                        color: '#fff',
                        cursor: 'pointer',
                    }}
                >
                    Jetzt neu laden
                </button>
            </div>
        );
    }
}
