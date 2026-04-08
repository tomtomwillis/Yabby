# AsciiMan

**File:** `src/components/AsciiMan.tsx`

Renders an animated ASCII art figure that toggles between two poses at 500 ms intervals.

## Usage

```tsx
<AsciiMan />
```

No props. Renders a `<pre>` element with the `ascii-art` CSS class (defined in `Stats.css`). The figure alternates between two frames — open and closed eyes, with a musical note motif — creating a simple dancing animation.

Used at the bottom of the Home page, outside of the `Stats` component.

## Customising

To change the animation speed, edit the `setInterval` delay in `AsciiMan.tsx` (currently `500`).

To change the art itself, edit the `asciiMan` array of frame strings at the top of the file.
