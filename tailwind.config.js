/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['ui-sans-serif', 'system-ui', 'sans-serif', 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji'],
            },
            keyframes: {
                fadein: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                // --- Screensaver transition keyframes ---
                // Crossfade
                'ss-crossfade-enter': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'ss-crossfade-exit': {
                    '0%': { opacity: '1' },
                    '100%': { opacity: '0' },
                },
                // Slide
                'ss-slide-enter': {
                    '0%': { transform: 'translateX(100%)' },
                    '100%': { transform: 'translateX(0)' },
                },
                'ss-slide-exit': {
                    '0%': { transform: 'translateX(0)', opacity: '1' },
                    '100%': { transform: 'translateX(-30%)', opacity: '0' },
                },
                // Push
                'ss-push-enter': {
                    '0%': { transform: 'translateX(100%)' },
                    '100%': { transform: 'translateX(0)' },
                },
                'ss-push-exit': {
                    '0%': { transform: 'translateX(0)' },
                    '100%': { transform: 'translateX(-100%)' },
                },
                // Zoom
                'ss-zoom-enter': {
                    '0%': { transform: 'scale(1.3)', opacity: '0' },
                    '100%': { transform: 'scale(1)', opacity: '1' },
                },
                'ss-zoom-exit': {
                    '0%': { transform: 'scale(1)', opacity: '1' },
                    '100%': { transform: 'scale(0.8)', opacity: '0' },
                },
                // Flip
                'ss-flip-enter': {
                    '0%': { transform: 'rotateY(-90deg)', opacity: '0' },
                    '100%': { transform: 'rotateY(0deg)', opacity: '1' },
                },
                'ss-flip-exit': {
                    '0%': { transform: 'rotateY(0deg)', opacity: '1' },
                    '100%': { transform: 'rotateY(90deg)', opacity: '0' },
                },
                // Blur
                'ss-blur-enter': {
                    '0%': { filter: 'blur(20px)', opacity: '0' },
                    '100%': { filter: 'blur(0px)', opacity: '1' },
                },
                'ss-blur-exit': {
                    '0%': { filter: 'blur(0px)', opacity: '1' },
                    '100%': { filter: 'blur(20px)', opacity: '0' },
                },
            },
            animation: {
                fadein: 'fadein 1s ease-in-out',
                'ss-crossfade-enter': 'ss-crossfade-enter 1.5s ease-in-out forwards',
                'ss-crossfade-exit': 'ss-crossfade-exit 1.5s ease-in-out forwards',
                'ss-slide-enter': 'ss-slide-enter 1.2s ease-in-out forwards',
                'ss-slide-exit': 'ss-slide-exit 1.2s ease-in-out forwards',
                'ss-push-enter': 'ss-push-enter 1s ease-in-out forwards',
                'ss-push-exit': 'ss-push-exit 1s ease-in-out forwards',
                'ss-zoom-enter': 'ss-zoom-enter 1.5s ease-out forwards',
                'ss-zoom-exit': 'ss-zoom-exit 1.5s ease-in forwards',
                'ss-flip-enter': 'ss-flip-enter 1s ease-in-out forwards',
                'ss-flip-exit': 'ss-flip-exit 1s ease-in-out forwards',
                'ss-blur-enter': 'ss-blur-enter 1.5s ease-in-out forwards',
                'ss-blur-exit': 'ss-blur-exit 1.5s ease-in-out forwards',
            },
        },
    },
    plugins: [],
}
