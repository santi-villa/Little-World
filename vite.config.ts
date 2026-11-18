import { versionedArt } from './scripts/versioned-art';
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
    versionedArt(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
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
        skipWaiting: true,
        clientsClaim: true,
        // json incluido: manifest.json de los assets tiene que venir de la misma versión que sus PNG.
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,json}', 'art/*.jpg'],
        cleanupOutdatedCaches: true,
        // Mode selection changes how the same entry document boots.
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^(fish-preview|tank|debug|classic-room|room-preview|actualizar)$/],
        // Exclude the original public PNG copies. The hashed fish textures
        // are part of the same bundle as their meshes and must work offline.
        globIgnores: [
          'assets/**/!(betta-illustrated-atlas-*|betta-front-head-*|corydoras-illustrated-*|neon-tetra-illustrated-*).png',
          'assets/manifest.json',
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
