import React, { useState } from 'react';
import { Delete, ArrowBigUp, Check } from 'lucide-react';

interface KeyboardProps {
    onClose?: () => void;
}

const keys = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'ß'],
    ['q', 'w', 'e', 'r', 't', 'z', 'u', 'i', 'o', 'p', 'ü'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ö', 'ä'],
    ['y', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-']
];

export const OnScreenKeyboard: React.FC<KeyboardProps> = ({ onClose }) => {
    const [shift, setShift] = useState(false);

    // Safety check: ensure we don't lose focus or handle it manually
    const handleKeyPress = (char: string) => {
        const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;

        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            const start = activeElement.selectionStart || 0;
            const end = activeElement.selectionEnd || 0;
            const value = activeElement.value;

            const charToInsert = shift ? char.toUpperCase() : char;

            const newValue = value.slice(0, start) + charToInsert + value.slice(end);

            // React state update helper
            // We need to trigger a native input event so React knows it changed
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value"
            )?.set;
            const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype,
                "value"
            )?.set;

            if (activeElement.tagName === 'INPUT' && nativeInputValueSetter) {
                nativeInputValueSetter.call(activeElement, newValue);
            } else if (activeElement.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
                nativeTextAreaValueSetter.call(activeElement, newValue);
            } else {
                activeElement.value = newValue;
            }

            activeElement.dispatchEvent(new Event('input', { bubbles: true }));

            // Restore cursor position
            requestAnimationFrame(() => {
                activeElement.setSelectionRange(start + 1, start + 1);
            });
        }
    };

    const handleBackspace = () => {
        const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;

        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
            const start = activeElement.selectionStart || 0;
            const end = activeElement.selectionEnd || 0;
            const value = activeElement.value;

            if (activeElement.selectionStart === activeElement.selectionEnd && start === 0) return; // Nothing to delete

            let newValue;
            let newCursorPos;

            if (start !== end) {
                // Delete selection
                newValue = value.slice(0, start) + value.slice(end);
                newCursorPos = start;
            } else {
                // Delete char before cursor
                newValue = value.slice(0, start - 1) + value.slice(end);
                newCursorPos = start - 1;
            }

            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;

            if (activeElement.tagName === 'INPUT' && nativeInputValueSetter) {
                nativeInputValueSetter.call(activeElement, newValue);
            } else if (activeElement.tagName === 'TEXTAREA' && nativeTextAreaValueSetter) {
                nativeTextAreaValueSetter.call(activeElement, newValue);
            } else {
                activeElement.value = newValue;
            }

            activeElement.dispatchEvent(new Event('input', { bubbles: true }));
            requestAnimationFrame(() => {
                activeElement.setSelectionRange(newCursorPos, newCursorPos);
            });
        }
    };

    const handleEnter = () => {
        const activeElement = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
        if (activeElement) {
            // Dispatch Enter key event
            activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            activeElement.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));

            // If textarea, insert newline
            if (activeElement.tagName === 'TEXTAREA') {
                handleKeyPress('\n');
            }
        }
    };

    // Keep focus on input when clicking keyboard buttons
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault(); // Prevents focus loss from input
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 h-1/3 bg-slate-900 border-t border-slate-700 p-2 z-50 shadow-2xl flex flex-col gap-1 transition-transform animate-in slide-in-from-bottom duration-300 safe-area-bottom">
            {keys.map((row, i) => (
                <div key={i} className="flex gap-1 flex-1">
                    {row.map(char => (
                        <button
                            key={char}
                            onMouseDown={handleMouseDown}
                            onClick={() => handleKeyPress(char)}
                            className="flex-1 bg-slate-800 hover:bg-slate-700 active:bg-blue-600 rounded text-xl font-bold text-white transition-colors"
                        >
                            {shift ? char.toUpperCase() : char}
                        </button>
                    ))}
                </div>
            ))}

            {/* Bottom Row: Shift, Space, Backspace, Enter */}
            <div className="flex gap-1 flex-1">
                <button
                    onMouseDown={handleMouseDown}
                    onClick={() => setShift(!shift)}
                    className={`flex-[1.5] rounded font-bold transition-colors flex items-center justify-center ${shift ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}
                >
                    <ArrowBigUp className={`w-8 h-8 ${shift ? 'fill-current' : ''}`} />
                </button>
                <button
                    onMouseDown={handleMouseDown}
                    onClick={() => handleKeyPress(' ')}
                    className="flex-[4] bg-slate-800 hover:bg-slate-700 active:bg-blue-600 rounded text-xl font-bold text-white transition-colors"
                >
                    Space
                </button>
                <button
                    onMouseDown={handleMouseDown}
                    onClick={handleBackspace}
                    className="flex-[1.5] bg-red-900/50 hover:bg-red-800 active:bg-red-700 text-red-200 rounded font-bold transition-colors flex items-center justify-center"
                >
                    <Delete className="w-6 h-6" />
                </button>
                <button
                    onMouseDown={handleMouseDown}
                    onClick={handleEnter}
                    className="flex-[1.5] bg-green-900/50 hover:bg-green-800 active:bg-green-700 text-green-200 rounded font-bold transition-colors flex items-center justify-center"
                >
                    <Check className="w-6 h-6" />
                </button>
            </div>

            {/* Close Hint for Admin (or hidden close button) */}
            <button
                onClick={onClose}
                className="absolute top-[-30px] right-4 bg-slate-800 text-white px-4 py-1 rounded-t-lg font-bold shadow-lg border-t border-x border-slate-700 hover:bg-red-600 transition-colors text-xs"
            >
                Tastatur schließen
            </button>
        </div>
    );
};
