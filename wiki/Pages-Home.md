# Home Page

**File:** `src/pages/Home.tsx`
**Route:** `/`

The landing page users see after logging in. It assembles several feature components into a single scrollable page.

## What It Shows

In order from top to bottom:

- **Recent stickers carousel** (`CarouselStickers`) — the 10 most recent sticker placements with a link to `/stickers`
- **Place a sticker** (`PlaceSticker` in `url-input` mode) — search for an album or paste a URL to place a sticker
- **Radio section** (`WebampRadio`) — "Now Playing" metadata and a toggle button that expands/collapses the Webamp player; links to `/radio`
- **Recent lists** (`RecentLists`) — up to three recently updated public lists; clicking a card navigates to that list; links to `/lists`
- **Stats** (`Stats`) — library statistics (album count, song count, song of the day) lazy-loaded for performance
- **Recent albums carousel** (`CarouselAlbums`) — the 10 most recently added albums from Navidrome with a link to the Navidrome web app
- **AsciiMan** — animated ASCII art figure at the very bottom of the page

A random subtitle is chosen from a pool of community in-jokes on each page load.

## Components Used

`CarouselStickers`, `PlaceSticker`, `WebampRadio`, `RecentLists`, `Stats` (lazy), `CarouselAlbums`, `AsciiMan`

## Customising

To change what appears on the home page, edit the JSX in `Home.tsx`. Each section is a self-contained component that can be removed, reordered, or replaced.

To add or remove subtitle messages, edit the `SUBTITLES` array near the top of `Home.tsx`.

The page has no CSS of its own — layout is handled by `App.css` and by each component's own styles.
