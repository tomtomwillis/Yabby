# AsciiTitle

**File:** `src/components/basic/AsciiTitle.tsx`

Renders the Yabbyville ascii wordmark, scaled to fit whatever wrapper it's placed in.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `src` | `string` (optional) | Path to the ascii art text file. Defaults to `/asciititle.txt`. |

## Usage

```tsx
<AsciiTitle />
```

Fetches the text file on mount, then measures its natural (unscaled) width against the wrapper's available width and applies a CSS `scale()` transform so it always fits without wrapping or overflowing. Re-measures via `ResizeObserver` on both the wrapper and the `<pre>` itself (the pixel font swaps in after `document.fonts.ready` resolves, which changes natural width without changing the wrapper's), and on `orientationchange`.

Used in `Home.tsx` twice — once in the bottom bar (`home-bottom`) and once in the mobile masthead (`home-top-title`) — only one of which is visible at a time; each instance fits itself independently. The `<pre>` is `aria-hidden`, since it's decorative rather than the page's actual heading.

## Customising

- **Art source:** edit `public/asciititle.txt`.
- **Font/colour:** `AsciiTitle.css`.
