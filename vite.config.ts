import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Deep green + parchment — kept in sync with the CSS theme tokens.
const THEME_GREEN = '#0f4d3c'
const PARCHMENT = '#f6efdd'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: 'Noha Directory',
        short_name: 'Noha',
        description: 'Browse, search and recite noha — works offline.',
        lang: 'ur',
        dir: 'rtl',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: THEME_GREEN,
        background_color: PARCHMENT,
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + static assets are precached.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Read API (occasions, nohas, themes): NetworkFirst -> cache fallback,
            // so the fihrist and search still open offline after one online visit.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'noha-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Noha scans (/img/:key): CacheFirst, so any image a reciter has
            // already opened stays available offline with no signal.
            urlPattern: ({ url }) => url.pathname.startsWith('/img/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'noha-images',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Nastaliq / serif webfonts (if self-hosted or from Google Fonts).
            urlPattern: ({ url }) =>
              url.origin === 'https://fonts.gstatic.com' ||
              url.origin === 'https://fonts.googleapis.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
