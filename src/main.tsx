import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'

// Register service worker
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New content available. Reload to update?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline')
  },
})

// A deploy replaces every hashed file, so a tab opened before it asks for
// pages that no longer exist. Reloading picks up the new build; the timestamp
// stops a file that is really missing from reloading in a loop.
const RELOADED_KEY = 'yabby.staleChunkReload'
const RELOAD_AT_MOST_EVERY_MS = 60_000
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_KEY)) || 0
    if (Date.now() - last < RELOAD_AT_MOST_EVERY_MS) return
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()))
  } catch {
    // Without session storage there is no loop guard, so the page's own
    // error is shown instead.
    return
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
