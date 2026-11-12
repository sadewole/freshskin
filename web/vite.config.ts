import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Builds straight into `app/public`, which `app/server.ts` already serves. The server owns
 * routing and the CSP; this config only decides how the assets are produced.
 *
 * Two constraints come from that server and are not negotiable here:
 *  - CSP is `script-src 'self'`, so no inline scripts and no CDN imports. Vite's output
 *    already satisfies this; do not add a plugin that injects inline boot code.
 *  - The service worker is served from the origin root (`/sw.js`) so its scope covers every
 *    route. `registerType: 'autoUpdate'` is right for a data-driven app: a stale shell that
 *    keeps serving old product data is worse than a reload.
 */
export default defineConfig({
  root: resolve(__dirname),
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      strategies: 'generateSW',
      filename: 'sw.js',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'FreshSkin',
        short_name: 'FreshSkin',
        description: 'Skincare and scent that actually fits you.',
        lang: 'en-NG',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The shell is precached; API responses are never cached. Recommendation, consent and
        // scan data are per-user and must never be served from a cache to a different session.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    outDir: resolve(__dirname, '../app/public'),
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['react', 'react-dom'] },
      },
    },
  },
  server: {
    // In development the Vite dev server stands in for `app/server.ts`, so API calls and the
    // session cookie need to reach the real Node process.
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
});
