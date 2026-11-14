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
        // Brand ground: cream splash in light, deep plum-brown in dark. These paint the
        // launch screen before CSS loads, so they mirror tokens.css, not the old slate.
        background_color: '#fbf5ec',
        theme_color: '#a62b52',
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
  optimizeDeps: {
    // Pre-bundle every runtime dependency up front. Without this, Vite discovers `motion/react`
    // and `lucide-react` lazily on first import, re-runs the optimizer mid-session, and rewrites
    // the `chunk-*.js` hashes under a browser still holding the old ones — "file does not exist
    // in the optimize deps directory". Listing them keeps the cache stable across a dev session.
    include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'lucide-react', 'motion/react'],
  },
  build: {
    outDir: resolve(__dirname, '../../dist/apps/web'),
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
    // In development the Vite dev server stands in for `apps/api/app/server.ts`, so API calls and the
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
