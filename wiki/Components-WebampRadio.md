# WebampRadio

**File:** `src/components/WebampRadio.tsx`

Embeds a Webamp (Winamp-in-the-browser) player pointed at the community radio stream, with Butterchurn visualiser support. Falls back to the simpler `RadioPlayer` component on mobile.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `containerRef` | `React.RefObject<HTMLDivElement \| null>` | Ref to the DOM element Webamp will render into |
| `onLoadingChange` | `(loading: boolean) => void` (optional) | Called when the loading state changes |
| `onErrorChange` | `(error: string \| null) => void` (optional) | Called with an error message if initialisation fails |

## Usage

```tsx
const containerRef = useRef<HTMLDivElement>(null);

<div ref={containerRef} />
<WebampRadio
  containerRef={containerRef}
  onLoadingChange={setWebampLoading}
  onErrorChange={setWebampError}
/>
```

## Behaviour

- On **desktop** (viewport `>= 768px`): dynamically imports `webamp/butterchurn`, picks a random skin from `public/skins/`, and calls `webamp.renderWhenReady(container)`. Webamp manages its own DOM inside the container element.
- On **mobile**: renders `<RadioPlayer />` instead — a lightweight `<audio>` player.
- Webamp is disposed on component unmount to prevent audio/memory leaks.

Used on the [Home page](Pages-Home) (toggle button) and the [Radio page](Pages-Radio) (auto-opens on load).

## Customising

- **Stream URL**: update `STREAM_URL` at the top of `WebampRadio.tsx`.
- **Skins**: add `.wsz` files to `public/skins/` and add an entry to the `generateSkinsList` array.
- **Default window layout**: edit the `windowLayout` object passed to `new WebampClass({...})`.
