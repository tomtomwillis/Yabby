# VisualiserDock

**File:** `src/components/VisualiserDock.tsx`
**CSS:** `src/components/VisualiserDock.css`

The butterchurn visualiser box in the home page's bottom bar.

## Usage

```tsx
<VisualiserDock />
```

No props. Reads `vizOpen` / `vizFullscreen` from `usePlayerState()` and toggles fullscreen via `usePlayerActions().setVizFullscreen`. This component only supplies a host `<div>` (via the `registerVizHost` callback ref) — the actual canvas is created and owned by `useAudioEngine`, which re-parents the live canvas in and out of this node as it mounts, unmounts, or goes fullscreen. It always shows whichever source is currently playing, since the audio engine feeds the visualiser from the sum of both the library and radio elements.

Mounted in `Home.tsx`'s bottom bar, gated in JS behind a `min-width: 901px` media query so mounting — and the butterchurn import it triggers — never happens on a phone. The `[ viz ]` switch that opens/closes it lives on `PlayerBar`, not here.

## Customising

- **Fullscreen toggle icon/label:** the `vz-fs` button in this file.
- **Canvas/box sizing:** `VisualiserDock.css`.
- **Visualiser engine itself:** `src/utils/useAudioEngine.tsx`.
