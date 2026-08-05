# BlockRange

**File:** `src/components/basic/BlockRange.tsx`

An ascii block-meter range input — a row of `█`/`░` cells overlaid on a native `<input type="range">`. Used for the player bar's seek bar and volume slider.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `label` | `string` | Accessible label for the underlying range input. |
| `value` | `number` | Current value. |
| `max` | `number` | Maximum value. |
| `step` | `number` | Step size passed to the range input. |
| `cellPx` | `number` | Target pixel width per block cell. |
| `minBlocks` | `number` | Minimum number of cells regardless of width. |
| `className` | `string` (optional) | Extra class on the wrapper. |
| `disabled` | `boolean` (optional) | Disables the input. |
| `onChange` | `(value: number) => void` | Fired on drag/change. |

## Usage

```tsx
<BlockRange
  label="Seek"
  value={currentTime}
  max={duration}
  step={0.1}
  cellPx={SEEK_CELL_PX}
  minBlocks={SEEK_MIN_BLOCKS}
  onChange={seek}
/>
```

Block count is measured off the container's rendered width via `ResizeObserver` (`width / cellPx`, floored at `minBlocks`), so a wider bar renders at a proportionally higher resolution instead of the same handful of blocks stretched apart with gaps. Each block is its own CSS grid cell (`1fr`) so the row always sums to exactly the container's width, unlike a fixed-length unicode string whose width comes from font metrics.

Used twice in `PlayerBar.tsx` — seek bar and volume — each with its own cell size and minimum exported as constants (`SEEK_CELL_PX`, `SEEK_MIN_BLOCKS`, `VOLUME_CELL_PX`, `VOLUME_MIN_BLOCKS`).

## Customising

- **Granularity:** the `cellPx` / `minBlocks` constants at the top of the file, referenced from `PlayerBar.tsx`.
- **Styling:** `BlockRange.css`.
