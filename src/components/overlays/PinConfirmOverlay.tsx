import React, { useState, useEffect } from 'react';
import { X, Check, Delete } from 'lucide-react';

interface PinConfirmOverlayProps {
    active: boolean;
    title: string;
    subtitle?: string;
    onConfirm: (pin: string) => void;
    onCancel: () => void;
    error?: string;
    loading?: boolean;
}

export const PinConfirmOverlay: React.FC<PinConfirmOverlayProps> = ({
    active, title, subtitle, onConfirm, onCancel, error, loading
}) => {
    const [pin, setPin] = useState('');

    useEffect(() => {
        if (active) setPin('');
    }, [active]);

    if (!active) return null;

    const handleDigit = (digit: string) => {
        if (pin.length < 6) setPin(prev => prev + digit);
    };

    const handleDelete = () => {
        setPin(prev => prev.slice(0, -1));
    };

    const handleSubmit = () => {
        if (pin.length > 0) onConfirm(pin);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={onCancel}
        >
            <div
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-700 w-[340px] p-6 relative"
                onClick={e => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={onCancel}
                    className="absolute top-3 right-3 p-1 text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Title */}
                <h3 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-1">{title}</h3>
                {subtitle && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-4">{subtitle}</p>
                )}

                {/* PIN display */}
                <div className="flex justify-center gap-2 mb-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className={`w-12 h-12 rounded-lg border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                                i < pin.length
                                    ? 'border-blue-500 bg-blue-600/20 text-slate-900 dark:text-white'
                                    : 'border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600'
                            }`}
                        >
                            {i < pin.length ? '\u2022' : ''}
                        </div>
                    ))}
                </div>

                {/* Error */}
                {error && (
                    <p className="text-red-400 text-sm text-center mb-3">{error}</p>
                )}

                {/* Numpad */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit => (
                        <button
                            key={digit}
                            onClick={() => handleDigit(digit)}
                            className="h-14 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xl font-bold transition active:scale-95 border border-slate-300 dark:border-slate-700"
                        >
                            {digit}
                        </button>
                    ))}
                    <button
                        onClick={handleDelete}
                        className="h-14 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-red-600/40 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition active:scale-95 border border-slate-300 dark:border-slate-700 flex items-center justify-center"
                    >
                        <Delete className="w-6 h-6" />
                    </button>
                    <button
                        onClick={() => handleDigit('0')}
                        className="h-14 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-xl font-bold transition active:scale-95 border border-slate-300 dark:border-slate-700"
                    >
                        0
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={pin.length === 0 || loading}
                        className="h-14 rounded-xl bg-green-600 hover:bg-green-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 text-white transition active:scale-95 border border-green-500 disabled:border-slate-400 dark:disabled:border-slate-600 flex items-center justify-center"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Check className="w-6 h-6" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
