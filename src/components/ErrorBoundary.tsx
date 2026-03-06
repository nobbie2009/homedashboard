import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
    children: React.ReactNode;
    fallbackClassName?: string;
}

interface State {
    hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(): State {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className={`flex flex-col items-center justify-center gap-3 p-4 bg-slate-800/50 rounded-xl border border-red-900/50 text-slate-400 ${this.props.fallbackClassName || 'h-full'}`}>
                    <AlertTriangle className="w-8 h-8 text-red-400" />
                    <span className="text-sm">Etwas ist schiefgelaufen</span>
                    <button
                        onClick={() => this.setState({ hasError: false })}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition"
                    >
                        <RefreshCw className="w-3 h-3" />
                        Erneut versuchen
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
