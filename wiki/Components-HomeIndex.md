# HomeIndex

**File:** `src/components/HomeIndex.tsx`
**CSS:** `src/components/HomeIndex.css`

The home page's left-rail site index: nav groups drawn as a tree with box-drawing characters, doubling as the desktop nav.

## Usage

```tsx
<HomeIndex />
```

No props. Pulls its data from `useNavGroups()` (`src/components/basic/navGroups.ts`) — the same nav table the mobile drawer in `Header` uses, so the two can't drift out of sync. Draws a `🏠 home` root row followed by each group (`Music`, `Social`, `Yabby`) as a branch, with each group's links one level deeper, connected with `┌─`/`├─`/`└─`/`│` characters.

Two links are dropped from the rail via `HIDDEN_ON_HOME` — `radio` (the bottom bar's player already is the radio) and `stickers` (the sticker wall already fills the top of the dashboard) — since a rail row for either would be a second way to reach something already on screen. External links (Navidrome, Soulseek) open in a new tab; internal links use `react-router-dom`'s `Link` and get an `is-active` class when the current route matches.

Used in `Home.tsx`'s `.home-side` rail, above the `Stats` and `Weather` `SideSection` blocks.

## Customising

- **Nav structure/links:** edit `useNavGroups()` in `src/components/basic/navGroups.ts` — shared with `Header`'s mobile drawer, so changes apply everywhere.
- **What's hidden on home:** `HIDDEN_ON_HOME` set at the top of the file.
- **Tree styling:** `HomeIndex.css`.
