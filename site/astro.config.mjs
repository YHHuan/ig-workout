import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import AstroPWA from '@vite-pwa/astro';

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  site: 'https://ig-workout.pages.dev',

  // SSR mode — needed so /api/* routes can run at request time. Individual
  // pages opt back into static via `export const prerender = true;` (the
  // homepage does — it reads clips.json at build time; a small client script
  // patches the DOM with any live edits from the DB on each page load).
  output: 'server',

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [
    AstroPWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg'],
      manifest: {
        name: 'Workout Clips',
        short_name: 'Clips',
        description: 'Personal gym clip library',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // Phase 6 will add runtimeCaching for R2-hosted clips. Phase 1 caches only the shell.
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],

  adapter: cloudflare()
});