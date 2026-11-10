# Progressive Web App (PWA)

Yabbyville is a PWA, meaning it can be installed on phones and desktops and works offline for cached content.

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

- The install precaches the app shell and the everyday pages only (about 2 MB)
- Sticker images are cached as they are shown, and refreshed in the background
- Tools and heavy optional libraries (the cinema player, terminal, map, visualiser — the `opt-*` chunks in `vite.config.ts`) are fetched on first use and then kept
- Album covers through the music proxy are cached for 7 days; streams always go to the network
- `/api/*` links opened in their own tab are never answered with the app shell
- Google Fonts cached for 1 year

## Customising

To change the app name, theme colour, or icons for your own deployment:

1. Update the manifest config in `vite.config.ts`
2. Replace the icon files in `public/icons/`
3. Update the `<meta name="theme-color">` tag in `index.html`
