import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
/* Libraries only a few pages need. Each gets a chunk of its own under one
   prefix, so the service worker can leave them out of the install (see
   globIgnores) and a page that never opens the cinema never downloads hls.js. */
const OPTIONAL_VENDORS: Record<string, string> = {
  'hls.js': 'hls',
  'leaflet': 'leaflet',
  'react-leaflet': 'leaflet',
  '@react-leaflet': 'leaflet',
  '@xterm': 'xterm',
  'butterchurn': 'butterchurn',
  'butterchurn-presets': 'butterchurn-presets',
  'marked': 'marked',
}

/* Split by how often code changes rather than by where it is used: Firebase
   and React are most of the first load and change only on a dependency bump,
   so a deploy that touches app code leaves them cached. */
function vendorChunk(id: string): string | undefined {
  const [, path] = id.split('/node_modules/')
  if (!path) return undefined
  const name = path.startsWith('@') ? path.split('/').slice(0, 2).join('/') : path.split('/')[0]
  const scope = name.split('/')[0]
  const optional = OPTIONAL_VENDORS[name] ?? OPTIONAL_VENDORS[scope]
  if (optional) return `opt-${optional}`
  if (scope === '@firebase' || name === 'firebase' || name === 'idb' || name === 're2js') return 'vendor-firebase'
  if (['react', 'react-dom', 'scheduler', 'react-router', 'react-router-dom'].includes(name)) return 'vendor-react'
  return undefined
}

export default defineConfig({
  build: {
    rollupOptions: {
      output: { manualChunks: vendorChunk },
    },
  },
  server: {
    proxy: {
      // WebSocket rule MUST come before the general /api/media rule
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
      '/api/data': {
        target: 'https://yabbyville.xyz',
        changeOrigin: true,
        secure: true,
      },
      '/api/music': {
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
        // A photo or a calendar feed opened in its own tab is a navigation
        // too, and must reach the server rather than be answered with the app.
        navigateFallbackDenylist: [/^\/api\//],
        // The install is the shell and the pages most visits open. Tools and
        // the heavy optional libraries are fetched when first used and kept
        // by the runtime rule below, as are sticker images.
        globIgnores: [
          '**/opt-*',
          '**/MediaManager-*',
          '**/Test-*',
          '**/SpacingLab-*',
        ],
        runtimeCaching: [
          {
            // Built files carry a content hash in their name, so one that is
            // cached can never be out of date.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'lazy-assets',
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [200]
              }
            }
          },
          {
            // Sticker images keep their name when redrawn, so each is shown
            // from the cache and refreshed behind it.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/Stickers/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'stickers',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              },
              cacheableResponse: {
                statuses: [200]
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
            // Covers through the music proxy. Same origin, so a response is
            // never opaque and only a real 200 is kept; a 401 before the music
            // cookie is set must not be cached. Everything else under
            // /api/music falls through to the network: streams need Range
            // support the cache does not have, and metadata changes.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname === '/api/music/rest/getCoverArt',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'music-covers',
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              },
              cacheableResponse: {
                statuses: [200]
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