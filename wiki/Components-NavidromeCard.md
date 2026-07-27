# NavidromeCard

**Files:** `src/components/NavidromeCard.tsx`, `src/utils/useNavidromeCard.tsx`

Floating "hover card" that shows an album or artist's details — cover, track list, releases — without leaving the page. Used for `@`-tagged albums/artists in message board posts (`NavidromeTagLink`, in `UserMessages`) and for the Recently Added carousel on the Home page (`CarouselAlbums`).

## How it's opened

`NavidromeCardProvider` is mounted once near the app root (`App.tsx`) and holds at most one **pinned** card and one **hover** card at a time. Consume it with the hook:

```tsx
const { open, close } = useNavidromeCard();

open({
  target: { type: 'album', id: album.id }, // or { type: 'artist', id }
  at: { x: e.clientX, y: e.clientY },      // where to place it
  pinned: true,                             // stays open until closed
  follow: false,                            // track the cursor while open
});
```

- `pinned: true` — clicking a target opens (or replaces) the one pinned card. Opening a new pinned card while one is already open closes the old one automatically — there is only ever one pinned card.
- `pinned: false` (hover) — shown on mouseenter, dismissed with `close(target)` on mouseleave. A hover card is thrown away rather than tracked, so it can layer on top of an existing pinned card without disturbing it.
- `follow: true` — the card tracks the cursor while open (used for hover previews); `follow: false` — placed once and left, then draggable if pinned.

`NavidromeTagLink` is the reference implementation for wiring up a clickable/hoverable target: it opens a hover card on `mouseenter`, pins on click, and lets modified clicks (cmd/ctrl/shift/alt) fall through to the underlying `<a href>` so the album still opens in Navidrome in a new tab instead of being intercepted.

## What the card shows

- **Album**: cover art (opens a `Lightbox` on click), title/artist (link to Navidrome), year/label, a `[View in Navidrome]` link, and the full track list
- **Artist**: portrait, name, release count, and a two-column grid of releases — clicking a release expands an inline track list accordion beneath it

Both album and artist bodies fetch via `loadAlbumCard` / `loadArtistCard` (`src/utils/navidromeCards.ts`), which share a promise cache with the sticker player so opening a card and then playing from it doesn't re-fetch.

Track rows call `playAlbum` from `useStickerPlayer` (see [StickerAlbumPlayer](Components-StickerAlbumPlayer)) — playback is shared with the rest of the app and continues in the docked mini-bar after the card closes.

## Frame behaviour

- Pinned cards are draggable (grab the title bar or top edge) and resizable (bottom-right corner)
- Sized to fit the album's track list on first load (once only — a manual resize disables further auto-sizing)
- Below 600px width the card becomes a full-width bottom sheet instead of a floating window
- Escape closes a pinned card (unless a lightbox is open, which claims Escape first)
- An unpinned (hover) card ignores pointer events so it can never swallow the `mouseleave`/click on the tag that opened it

## Customising

Card and hint sizing constants (`ALBUM_SIZE`, `ARTIST_SIZE`, `MIN_SIZE`, `SHEET_QUERY`) are at the top of `NavidromeCard.tsx`. Styling is in `navidromeCard.css`; track list rows reuse `stickerPlayer.css` classes (`sp-tracks`, `sp-track`) so both players look identical.
