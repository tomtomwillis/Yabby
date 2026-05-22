# WeathrAnimation

Decorative ASCII weather scene shown on the home page. A TypeScript port of the
[Veirt/weathr](https://github.com/Veirt/weathr) Rust TUI — same animations and
ASCII art, but rendered directly into the DOM with no terminal emulator,
WebSocket, or backend dependency.

## Where it lives

```
src/components/weathr/
├── WeathrAnimation.tsx       — React wrapper (props, fetch, frame loop)
├── WeathrAnimation.css       — layout + the three "subtle lift" effects
└── weathr/                    — engine, mirrors the Rust source layout
    ├── types.ts               — WeatherCondition + intensity routing
    ├── colors.ts              — named colour palette (light/dark modes)
    ├── assets.ts              — ASCII art (sun, moon phases, clouds, …)
    ├── renderer.ts            — 2D cell grid → HTML colour-run output
    ├── scene.ts               — ground + house + tree/fence/mailbox/pine
    ├── animations.ts          — 13 animation systems (rain, snow, stars, …)
    └── engine.ts              — orchestrator: layer ordering, layout, frame step
```

## Using it

```tsx
import WeathrAnimation from '../components/weathr/WeathrAnimation';

<WeathrAnimation />
```

All props are optional. The component fetches current weather from Open-Meteo
on mount and matches the animation to it.

## Linking to Open-Meteo

The component calls Open-Meteo directly — no backend round-trip:

```
https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &current_weather=true
  &windspeed_unit=kmh
```

The `current_weather` payload supplies `weathercode`, `temperature`,
`windspeed`, `winddirection`, and `is_day`. The WMO weather code is mapped to
the internal `WeatherCondition` enum by `conditionFromWeatherCode()` in
`WeathrAnimation.tsx`:

| WMO codes                  | Condition           | Effect                          |
| -------------------------- | ------------------- | ------------------------------- |
| `0`                        | `clear`             | sun, birds, clouds              |
| `1`, `2`                   | `partly-cloudy`     | sun + scattered clouds          |
| `3`                        | `overcast`          | dense darker clouds             |
| `45`, `48`                 | `fog`               | fog wisps                       |
| `51`, `53`, `55`           | `drizzle`           | light rain (cyan)               |
| `56`, `57`, `66`, `67`     | `freezing-rain`     | heavier rain                    |
| `61`, `63`, `65`           | `rain`              | normal rain                     |
| `80`, `81`, `82`           | `rain-showers`      | normal rain                     |
| `71`, `73`, `75`           | `snow`              | heavy snow                      |
| `77`                       | `snow-grains`       | light snow                      |
| `85`, `86`                 | `snow-showers`      | medium snow                     |
| `95`                       | `thunderstorm`      | rain + lightning bolts + flash  |
| `96`, `99`                 | `thunderstorm-hail` | storm-strength rain + lightning |

Wind speed and direction drive the cloud drift and rain/snow lean angle the
same way the upstream Rust app does. `is_day` swaps the entire palette (day
sky/grass/house vs night with stars, moon, and fireflies on warm clear nights).

If the fetch fails, the scene falls back to a clear day rather than blanking.

## Adjusting size

The animation is a fixed grid of character cells. Two knobs:

- **Grid dimensions** — `cols` (default `150`) and `rows` (default `40`). These
  are the number of character cells across and down.
- **Pixel size of each cell** — `fontSizePx` (default `10`).

```tsx
<WeathrAnimation cols={120} rows={32} fontSizePx={14} />
```

### JGS font sizing

The component uses the in-repo JGS pixel font. JGS comes in three variants —
`jgs5`, `jgs7`, `jgs9` — each designed to look crisp at a specific pixel
multiple. `WeathrAnimation` picks the right one for `fontSizePx`:

| Size                | Font  |
| ------------------- | ----- |
| multiple of **10**  | jgs5  |
| multiple of **14**  | jgs7  |
| multiple of **18**  | jgs9  |
| other               | nearest of the above |

So `fontSizePx={10}` → jgs5, `{14}` → jgs7, `{18}` → jgs9, `{20}` → jgs5, etc.
Pick a multiple to keep the text sharp — non-multiples interpolate and look
blurry.

## Adjusting colours

Colours live in [`weathr/colors.ts`](../src/components/weathr/weathr/colors.ts).
There are two complete palettes:

- **`light`** (default) — mid-to-dark shifted, tuned to read against the
  white/orange home page background.
- **`dark`** — bright/saturated, matches the original Rust app's terminal
  colours (use this if you ever place the scene over a black backdrop).

Switch via prop:

```tsx
<WeathrAnimation paletteMode="dark" />
```

To re-tune a named colour (e.g. make the sun more orange), edit the matching
entry in `LIGHT_NAMED` / `DARK_NAMED`. A small number of animations use
literal RGB values rather than named colours (`FallingLeaves`, the brighter
firefly states, fog wisps). Those are in
[`animations.ts`](../src/components/weathr/weathr/animations.ts) — search for
`r:` in that file.

## Subtle "lift" effects

The component is transparent by default. Three subtle effects sit on top to
make it readable against the busy white/orange backdrop. Each is independent
and can be removed without touching the others — all live in
[`WeathrAnimation.css`](../src/components/weathr/WeathrAnimation.css):

1. **Radial vignette mask** on `.weathr-frame` — fades the edges of the scene
   into transparency so it doesn't end in a hard rectangle. Roll back: delete
   the `mask-image` / `-webkit-mask-image` declarations.
2. **Soft white text-halo** on `.weathr-pre` — `text-shadow` puts a faint
   bright ring around every character so glyphs read on both the white card
   body and the orange strips. Roll back: delete the `text-shadow` line.
3. **Warm drop-shadow** on `.weathr-pre` — almost imperceptible 1-pixel amber
   shadow that lifts the scene a hair off the page. Roll back: delete the
   `filter` line.

## Other props (testing / overrides)

When you need to force a particular scene (e.g. to screenshot the snow
animation in the wiki), the Open-Meteo fetch can be skipped:

```tsx
<WeathrAnimation conditionOverride="thunderstorm-hail" isDayOverride={false} />
<WeathrAnimation conditionOverride="snow" />
<WeathrAnimation conditionOverride="clear" isDayOverride={false} />  {/* night */}
```

`fps` (default `20`) controls how often the engine re-renders; lower it on
slow devices, raise it for smoother motion. `showLeaves` toggles the autumn
leaves overlay (off by default — they only make sense in a few months of the
year and clash with the orange page background).

## How a frame is built

Each `requestAnimationFrame` tick (throttled to `fps`):

1. `engine.step()` clears the cell grid.
2. **Background layer** runs — stars/moon (night) or sun/birds/airplanes (day),
   plus clouds. Each system checks `isActive(ctx)` against the current weather
   flags and skips itself if not relevant.
3. **World scene** is drawn — ground, house, tree, fence, mailbox, optional
   pine. The ground uses a deterministic `pseudo_rand(x, y)` so grass and
   flowers are stable frame-to-frame rather than flickering.
4. **Post-scene layer** — chimney smoke (drawn after the house so it rises
   above the roof).
5. **Foreground layer** — rain / snow / fog / thunderstorm / falling leaves,
   whichever match the current conditions.
6. If lightning struck this frame, every cell's colour is overwritten with
   bright white (the "flash" effect).
7. The grid is serialised to HTML by batching consecutive same-colour cells
   into `<span style="color:…">…</span>` runs, one row per line, and assigned
   to the `<pre>`'s `innerHTML`.
