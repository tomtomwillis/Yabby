import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'
import { markUpdateReady, reloadForStaleChunk } from './utils/appUpdate'

// Register service worker
registerSW({
  onNeedReload: markUpdateReady,
  onOfflineReady() {
    console.log('App ready to work offline')
  },
})

window.addEventListener('vite:preloadError', reloadForStaleChunk)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
