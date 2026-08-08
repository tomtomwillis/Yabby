# AnchoredBubble

**File:** `src/components/basic/AnchoredBubble.tsx`

A floating popup box anchored beside whatever triggered it, skinned like the travel map's pin bubble. Nothing behind it is dimmed or blocked — clicking elsewhere is what closes it.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `anchor` | `HTMLElement \| null` | The element the bubble hangs off. |
| `container` | `HTMLElement \| null` | Positioned ancestor the bubble is absolutely placed inside. |
| `placement` | `'below' \| 'above'` (optional) | Preferred side. Honoured where it fits, flipped where it does not. Defaults to `below`. |
| `onClose` | `() => void` | Called on outside click or Escape. |
| `children` | `React.ReactNode` | Bubble body content. |

## Usage

```tsx
<AnchoredBubble anchor={popup.anchor} container={wallRef.current} onClose={closePopup}>
  {/* content */}
</AnchoredBubble>
```

Used by `CarouselStickers` (the "add your own" sticker popup) and `CarouselAlbums`. It measures room above and below the anchor and picks whichever side has more space — a tile in the last row opens upward instead of running off the bottom of the screen. The downward measurement stops at the home shell's fixed bottom bar (`--hp-bar-h`, published by `Home.tsx`) rather than the viewport edge, since anything below that line would be painted over.

The body scrolls independently if the bubble is taller than the room available, and a `ResizeObserver` plus a captured `scroll` listener keep it re-positioned as content or the page changes.

## Customising

- **Room thresholds:** `OFFSET`, `EDGE`, `MIN_BODY`, `PREFERRED_ROOM` constants at the top of the file.
- **Visual style (tip, corners, border):** `AnchoredBubble.css`.
