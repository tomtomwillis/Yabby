import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      // WebSocket rules MUST come before the general /api/media rule
      '/api/media/beets/terminal': {
        target: 'wss://yabbyville.xyz',
        ws: true,
        changeOrigin: true,
        secure: true,
      },
      '/api/media': {
        target: 'https://yabbyville.xyz',
        changeOrigin: true,
        secure: true,
      },
      '/api/travel': {
        target: 'https://yabbyville.xyz',
        changeOrigin: true,
        secure: true,
      },
      '/api/cinema': {
        target: 'https://yabbyville.xyz',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Yabbyville',
        short_name: 'Yabbyville',
        description: 'A music community app for sharing and discovering albums',
        theme_color: '#ff69b4',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        // Webamp + butterchurn (~2.3MB) only load when the player is opened —
        // don't precache them at SW install
        globIgnores: ['**/*butterchurn*'],
        runtimeCaching: [
          {
            // Stickers are immutable images; cache on first use instead of
            // precaching all ~15MB of them at install time
            urlPattern: /\/Stickers\/.*\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sticker-images',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/music\.yabbyville\.xyz\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
})