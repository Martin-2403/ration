import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    // Manifest plus an auto-updating service worker, and nothing else yet.
    // Installability matters early because §10 treats an installed PWA as a
    // durability feature — browsers evict storage from plain sites sooner.
    // The two-cache strategy in §13 deliberately waits for layer 3: writing
    // runtime caching rules now would mean inventing routes that don't exist.
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // The default globPatterns omit woff2, which would leave the app
        // rendering in a fallback font offline. Only the latin subsets are
        // precached: the variable font ships cyrillic and greek too, and §14
        // scopes this app to German and English.
        globPatterns: ['**/*.{js,css,html,ico,png,svg}', '**/*latin*.woff2'],
      },
      manifest: {
        name: 'Ration',
        short_name: 'Ration',
        description: 'Local-first calorie and nutrient tracking.',
        display: 'standalone',
        start_url: '/',
        // Literal hex is unavoidable here — a web manifest cannot read CSS
        // variables. These mirror --primary and --bg from §15; if those
        // change, change them here too.
        theme_color: '#146C6A',
        background_color: '#F4F7F7',
        // Chrome and Edge withhold the install prompt without a 192px and a
        // 512px icon, so these are the price of the §10 durability argument.
        // The maskable pair is separate rather than `purpose: 'any maskable'`
        // on one file: Android crops maskable art to its own shape, and art
        // that survives that crop carries padding that looks wrong wherever
        // the icon is shown uncropped. The PNGs are rasterized from
        // public/icon.svg (rounded field, for uncropped use) and
        // public/icon-maskable.svg (full-bleed, mark inside the safe circle).
        //
        // iOS ignores this array entirely — its icon is the apple-touch-icon
        // link in index.html, and that one is rasterized from the *maskable*
        // source: iOS composites any transparency as black, so the rounded
        // field's transparent corners would show as black corners behind iOS's
        // own rounding.
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  // vue-i18n ships its v8 Options-API surface and its production devtools hooks
  // behind build flags; unset, both stay in the bundle, and neither is reachable
  // from a `legacy: false` instance. Worth 6.5 kB raw / 1.6 kB gzip — most of
  // what the i18n layer costs is the core plus the runtime message compiler,
  // which stays while messages are plain objects (#74).
  //
  // __VUE_I18N_FULL_INSTALL__ is left on, at a further 5 kB, so `$t` works in
  // templates while view copy is still being migrated (#73).
  define: {
    __VUE_I18N_LEGACY_API__: 'false',
    __INTLIFY_PROD_DEVTOOLS__: 'false',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
