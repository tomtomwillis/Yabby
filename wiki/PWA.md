# Progressive Web App (PWA)

YabbyVille is a PWA, meaning it can be installed on phones and desktops and works offline for cached content.

## Installing

**Android / Chrome:** tap the "Add to Home Screen" prompt or use the browser menu → Install.

**iOS / Safari:** tap Share → Add to Home Screen → Add.

**Desktop (Chrome/Edge):** look for the install icon in the address bar.

## Key Files

| File | Purpose |
|------|---------|
| `vite.config.ts` | Configures the PWA plugin — manifest, caching strategies, service worker |
| `src/main.tsx` | Registers the service worker and handles update prompts |
| `public/manifest.json` | App name, icons, theme colour, display mode |
| `public/icons/` | App icons: 192×192, 512×512, and Apple touch icon (180×180) |
| `index.html` | PWA meta tags and manifest link |

## Caching Strategy

- Stickers and fonts are precached by the service worker
- API requests to the music server use a NetworkFirst strategy (24-hour cache)
- Google Fonts cached for 1 year

## Customising

To change the app name, theme colour, or icons for your own deployment:

1. Update the manifest config in `vite.config.ts`
2. Replace the icon files in `public/icons/`
3. Update the `<meta name="theme-color">` tag in `index.html`
