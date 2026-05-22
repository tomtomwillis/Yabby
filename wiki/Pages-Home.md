# Home Page

**File:** `src/pages/Home.tsx`  
**CSS:** `src/pages/Home.css`  
**Route:** `/`

The landing page. Assembles all major feature sections into a dense, multi-column layout using `<fieldset>`/`<legend>` frames — bordered boxes with caption titles riding the border, in `[ bracket → ]` notation.

## Layout

Three-column flexbox grid (`.home-grid`). Each column is a flex container stacking panels vertically at natural height — no forced equal-height rows.

| Column | Width | Contents |
|--------|-------|----------|
| Left | 50% | Sticker wall, Place Sticker form |
| Middle | 25% | Radio player, Stats, News |
| Right | 25% | Lists, Recently Added, Weather |

Responsive breakpoints:
- **> 1100 px** — 3 columns (50 / 25 / 25)
- **700–1100 px** — Stickers full-width, middle and right each 50%
- **< 700 px** — single column

## Panels

Every section is a `<fieldset className="panel panel--{name}">` with a `<legend>`. Legends that link to a full page use `<a>` or `<Link>` inside the legend. Base styles in `.panel` / `.panel > legend` in `Home.css`; per-panel tweaks via `.panel--{name}`.

## Sections

### Sticker Wall (`CarouselStickers`)
A 4-column CSS grid of the 12 most recently stickered albums. Each tile is square aspect-ratio with the album cover and any placed stickers overlaid at their saved positions. Clicking a tile opens a popup: all stickers on that album (timestamp, username, optional favourite-track), a "Place Sticker" button, and a "Click to listen" link. Owners and admins can delete stickers. Below the wall: `PlaceSticker` in `url-input` mode for searching or pasting an album URL.

### Radio (`WebampRadio`)
Webamp player (275 × 116 px main window) with milkdrop visualiser stacked immediately below (275 × 174 px, `extraHeight: 2`). Auto-spawns on page load after a 600 ms delay — no toggle button. On mobile, `RadioPlayer` renders instead.

The container is sized to exactly match the rendered stack: 290 px tall × 275 px wide. Webamp's built-in centering logic mis-computes the bounding box when milkdrop has a custom `extraHeight`, so `WebampRadio.tsx` manually pins both windows to the container's top-left after render via `webamp.store.dispatch({ type: "UPDATE_WINDOW_POSITIONS", ... })`. A `ResizeObserver` and scroll/resize listeners re-pin on layout reflow.

Below the container: "♪ now playing: …" text from `useRadioMetadata`, shown when a track is playing.

### Stats (`Stats`)
Lazy-loaded. Displays total album count, total song count, song of the day (deterministic hash from today's date, changes daily, cached in `localStorage`), and a **From the Workshop** section showing the latest GitHub commit message, author, date, and total commit count (cached 30 min in `localStorage`).

### News (`RecentNews`)
The single most recent news post, truncated to 25 words. Shows a "FRESH!" badge if posted within the last 24 hours. If the latest post is within 48 hours, the page subtitle overrides to `"Fresh News!"`.

### Lists (`RecentLists`)
Up to 3 recently updated public lists, stacked vertically. Each card shows a wide thumbnail (16:7 aspect ratio) with the list title in a bar below. Clicking navigates to `/lists/:id`.

### Recently Added (`CarouselAlbums`)
CSS keyframe marquee of the 10 most recently added Navidrome albums. Album covers are 96 px squares with title and artist below. The track list duplicates itself so the loop joins seamlessly. Hover pauses the animation. Covers link to the album in the Navidrome web app.

### Weather
A combined panel:
1. **`Weather`** — one line: current temperature and condition for Glasgow (55.83°N, 4.27°W) from Open-Meteo, with a FontAwesome condition icon.
2. **`WeathrAnimation`** (lazy) — full-width ASCII weather animation from the same data, rendered into a `<pre>` via a custom pixel-font engine (jgs5/jgs7/jgs9 fonts).

The temperature line sits directly above the ASCII animation inside the same fieldset.

### AsciiMan
Animated two-frame ASCII figure at the bottom of the page, outside the column grid.

## Subtitle

A random entry from the `SUBTITLES` array (top of `Home.tsx`) is selected on each page load. Overrides to `"Fresh News!"` if the latest news post is within 48 hours.

## Customising

- **Add/remove sections:** Self-contained fieldsets in the appropriate `.home-col` div in `Home.tsx`.
- **Column weights:** `flex` basis values on `.home-col--stickers`, `.home-col--mid`, `.home-col--right` in `Home.css`.
- **Subtitles:** `SUBTITLES` array near the top of `Home.tsx`.
- **Sticker wall size:** `ALBUMS_IN_CAROUSEL` in `CarouselStickers.tsx` (default 12). Grid columns via `.sticker-wall { grid-template-columns: repeat(4, 1fr) }` in `CarouselStickers.css`.
- **Marquee speed:** `animation-duration` on `.albums-marquee__track` in `CarouselAlbums.css` (default 60 s).
- **Webamp milkdrop height:** `extraHeight` in `windowLayout.milkdrop` in `WebampRadio.tsx`. If changed, update the container CSS height to `116 + (extraHeight × 29)` px and the `y: y + 116` pin offset to match the actual main-window height.

## Components Used

`CarouselStickers`, `PlaceSticker`, `WebampRadio`, `RecentLists`, `Stats` (lazy), `CarouselAlbums`, `RecentNews`, `Weather`, `WeathrAnimation` (lazy), `AsciiMan`, `AsciiTitle`, `Header`
