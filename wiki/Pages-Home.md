# Home Page

**Files:** `src/pages/Home.tsx` (shell), `src/pages/HomeDashboard.tsx` (body)
**CSS:** `src/pages/Home.css`
**Route:** `/` — and every other authenticated route, which render inside the shell

Home is split in two. `Home.tsx` is a persistent **shell** that wraps all the
authenticated routes: the sidebar rail, the ascii wordmark and the player bar stay
mounted while pages swap through `<Outlet />`. `HomeDashboard.tsx` is what `/`
itself puts in that outlet.

Keeping the player in the shell is the point of the split — navigating between
pages never interrupts playback, because the audio element is never unmounted.

## Shell layout (`Home.tsx`)

```
┌─────────────┬──────────────────────────────┐
│ home-side   │ home-main                    │
│  HomeIndex  │  <Outlet />                  │
│  Stats      │                              │
│  Weather    │                              │
├─────────────┴──────────────────────────────┤
│ home-bottom: wordmark · visualiser · player│
└────────────────────────────────────────────┘
```

- **`.home-side`** — the rail. `HomeIndex` site tree, then two `SideSection`
  blocks (`stats`, `weather`) drawn with box characters, then the subtitle.
- **`.home-main`** — the routed page.
- **`.home-bottom`** — pinned to the viewport bottom: `AsciiTitle` wordmark,
  `VisualiserDock` (when open), `PlayerBar`, and `AsciiMan` passed to the player
  as its `trailing` slot so he sits at the end of the transport row.

### Bar height is measured, not calculated

The bar's height depends on the wordmark's fitted scale and how the player lays
out, so `Home.tsx` measures it with a `ResizeObserver` and publishes
`--hp-bar-h` on `document.documentElement`. Anything that has to clear the bar
reserves that variable. A second `useLayoutEffect` republishes on the
minimise/expand toggle so the padding doesn't trail a frame behind the reflow.

### Visualiser gating

The dock is gated in **JS**, not hidden in CSS (`VIZ_QUERY = min-width: 901px`).
A `display: none` dock would still mount, and mounting is what pulls in butterchurn
and starts a WebGL loop a phone would never show. `PlayerBar.css` hides the `[ viz ]`
switch at the same breakpoint via `.pb-mode--viz`.

### Masthead

`Header` is mounted but its `<header>` is `display: none` — the rail carries the
nav and the title is pinned bottom-left. Header stays for the burger button and
mobile drawer, which are siblings of `<header>`. On `/` an `.hp-sr` visually-hidden
`<h1>` supplies the heading a screen reader would otherwise not get, since the
wordmark is `aria-hidden` ascii. Off `/`, the routed page renders its own `h1`.

Mobile swaps to `.home-top-title` — a second wordmark copy. Only one is ever
visible; `AsciiTitle` fits itself to whichever wrapper is showing.

## Dashboard body (`HomeDashboard.tsx`)

Sections in order, each a `Section` component whose title links onward and whose
rule fills the remaining width:

| Section | Component | Notes |
|---|---|---|
| ✦ stickers | `CarouselStickers` | Header carries an `add your own` toggle revealing `PlaceSticker` in `inline-url` mode, plus a recent/random order switch |
| ♫ recently added | `CarouselAlbums` | Title links out to Navidrome's recently-added view |
| ≡ recent lists | `RecentLists` | Shares a `.home-row2` flex row with travel |
| ⚑ travel | `HomeTravel` | Lazy-loaded to keep leaflet out of the eager home chunk |

Newly placed stickers are injected straight into the carousel via a
`CarouselStickersHandle` ref (`injectSticker` + `refetch`) rather than waiting on
a re-fetch round trip.

## Subtitle

A random entry from the `SUBTITLES` array at the top of `Home.tsx`, picked once on
mount. Rendered twice — in the mobile masthead and at the foot of the rail.

## Customising

- **Add/remove dashboard sections:** `Section` blocks in `HomeDashboard.tsx`.
- **Rail contents:** `SideSection` blocks in `Home.tsx`; the nav tree itself comes
  from `navGroups.ts` via `HomeIndex`.
- **Subtitles:** `SUBTITLES` array near the top of `Home.tsx`.
- **Visualiser breakpoint:** `VIZ_QUERY` in `Home.tsx` — keep it in step with
  `.pb-mode--viz` in `PlayerBar.css`.
- **Bar rule motif:** `RULE_MOTIF` / `RULE_REPEATS` in `Home.tsx`.
- **Weather scene size:** the `cols` / `minRows` / `fontSizePx` props on
  `WeathrAnimation` — fewer columns means more pixels per glyph. 88 is near the
  floor; the house alone is 64 wide.

## Components Used

**Shell:** `Header`, `AsciiTitle`, `HomeIndex`, `Stats` (lazy), `Weather`,
`WeathrAnimation` (lazy), `VisualiserDock`, `PlayerBar`, `AsciiMan`

**Dashboard:** `CarouselStickers`, `PlaceSticker`, `CarouselAlbums`, `RecentLists`,
`HomeTravel` (lazy)
