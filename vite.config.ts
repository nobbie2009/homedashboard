import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { execSync } from 'child_process'

let commitHash = '';
try {
  commitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (error) {
  console.warn('Git commit hash could not be retrieved:', error);
  commitHash = 'unknown';
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // Registration is driven by the React hook in <PwaUpdatePrompt />.
      injectRegister: false,
      includeAssets: ['pwa-icon.svg', 'pwa-icon-maskable.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/pwa',
        name: 'FamilyHub Manager',
        short_name: 'FamilyHub',
        description: 'Sterne, Aufgaben & Haushalt verwalten',
        start_url: '/pwa',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#2563eb',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Sterne', url: '/pwa?tab=sterne', icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Aufgaben', url: '/pwa?tab=aufgaben', icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Kalender', url: '/pwa?tab=kalender', icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Bad', url: '/pwa?tab=bad', icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Haushalt', url: '/pwa?tab=haushalt', icons: [{ src: '/pwa-192x192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/push-sw.js'],
        // Pull in the push / notificationclick handlers (see public/push-sw.js).
        importScripts: ['/push-sw.js'],
        cleanupOutdatedCaches: true,
        // The SPA shell is reachable offline, but we always try the network
        // first so the wall kiosk picks up new deploys and never gets stuck on
        // a stale HTML referencing missing chunks.
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url, request }) =>
              request.method === 'GET' &&
              (url.pathname.startsWith('/api/config') ||
                url.pathname.startsWith('/api/rewards/history')),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 5 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    'import.meta.env.VITE_GIT_COMMIT_HASH': JSON.stringify(commitHash),
  }
})
