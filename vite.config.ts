import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// El juego se publica en https://santi-villa.github.io/Little-World/
const BASE = '/Little-World/';

export default defineConfig({
  base: BASE,
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon-32.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Little World',
        short_name: 'Little World',
        description: 'Un acuario de pixel art con química del agua de verdad.',
        lang: 'es',
        start_url: BASE,
        scope: BASE,
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: '#0b1020',
        theme_color: '#0b1020',
        categories: ['games', 'simulation'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // json incluido: manifest.json de los assets tiene que venir de la misma versión que sus PNG.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,json}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
