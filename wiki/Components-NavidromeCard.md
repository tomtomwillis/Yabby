# NavidromeCard

**Files:** `src/components/NavidromeCard.tsx`, `src/utils/useNavidromeCard.tsx`, `src/utils/cardHost.ts`

Floating "hover card" frame shared by four kinds of content — a Navidrome album, a Navidrome artist, a calendar event, or a member's profile — without leaving the page. Used for `@`-tagged albums/artists in message board posts (`NavidromeTagLink`), for calendar event links posted by the Event Bot (`EventTagLink`), for usernames anywhere (`UsernameLink`), and for the Recently Added carousel on the Home page (`CarouselAlbums`).

## How it's opened

`NavidromeCardProvider` is mounted once near the app root (`App.tsx`, inside the `Router` so the calendar card can link onward) and holds at most one **pinned** card and one **hover** card at a time. Consume it with the hook:

```tsx
const { open, close } = useNavidromeCard();

open({
  target: { type: 'album', id: album.id }, // or 'artist' | 'event' | 'user'
  at: { x: e.clientX, y: e.clientY },      // where to place it
  pinned: true,                             // stays open until closed
  follow: false,                            // track the cursor while open
  exact: false,                             // `at` is the card's own top-left, not a cursor point
  back: undefined,                          // the CardTarget this one is replacing
});
```

- `pinned: true` — clicking a target opens (or replaces) the one pinned card. Opening a new pinned card while one is already open closes the old one automatically — there is only ever one pinned card.
- `pinned: false` (hover) — shown on mouseenter, dismissed with `close(target)` on mouseleave. A hover card is thrown away rather than tracked, so it can layer on top of an existing pinned card without disturbing it.
- `follow: true` — the card tracks the cursor while open (used for hover previews); `follow: false` — placed once and left, then draggable if pinned.
- `exact: true` — `at` is the card's own top-left corner rather than a point beside the cursor. Used when one card takes another's exact place (see "Cards within cards" below).
- `back` — the `CardTarget` this card is replacing; when set, a `‹ back to <type>` button appears in the title bar.

`NavidromeTagLink` and `EventTagLink` are the reference implementations for wiring up a clickable/hoverable target: they open a hover card on `mouseenter`, pin on click, and let modified clicks (cmd/ctrl/shift/alt) fall through to the underlying `<a href>` so the target still opens in a new tab instead of being intercepted.

## What the card shows

- **Album**: cover art (opens a `Lightbox` on click), title/artist (link to Navidrome), year/label, a `[View in Navidrome]` link, and the full track list. Clicking the artist name (pinned cards only) opens the artist's card in the album card's place.
- **Artist**: portrait, name, release count, and a two-column grid of releases — clicking a release expands an inline track list accordion beneath it.
- **Event** (`EventCardBody`, `src/components/events/EventCardBody.tsx`): image (if any), category, title, when/where/lineup/cost, who added it, description (through the shared `parseMessageHTML`, so its own `@`-tags render as tags), external links, the "interested?" tick, and a link into the calendar.
- **User** (`UserCardBody`, `src/components/basic/UserCardBody.tsx`): avatar, name, location, bio, site link, and a link to the full profile.

Album and artist bodies fetch via `loadAlbumCard` / `loadArtistCard` (`src/utils/navidromeCards.ts`), which share a promise cache with the sticker player so opening a card and then playing from it doesn't re-fetch. Event and user bodies read through `eventsApi.ts`'s and `userCache.ts`'s own caches respectively.

Track rows call `playAlbum` from `useStickerPlayer` (see [StickerAlbumPlayer](Components-StickerAlbumPlayer)) — playback is shared with the rest of the app and continues in the docked mini-bar after the card closes.

## Cards within cards

An event card's lineup and description can themselves contain `@`-tagged artists, albums or members. Clicking one of those inner tags replaces the event card **in its own place** rather than opening a new floating card: the clicked tag reads a `CardHost` from React context (`CardHostContext`, `src/utils/cardHost.ts`) giving it the host card's current screen position (`origin()`) and the `CardTarget` to go back to (`back`). It then calls `open({ ..., at: origin(), exact: true, back })`. The replacement card's title bar shows a `‹ back to event` button that reopens the original in the same spot. `NavidromeCard` sets up this context (`CardHostContext.Provider`) around an event card's body when it is pinned.

## Frame behaviour

- Pinned cards are draggable (grab the title bar or top edge) and resizable (bottom-right corner)
- Album and artist cards size to fit their content as it loads (once only — a manual resize disables further auto-sizing). Event and user cards are measured and fitted to their content **before** they are shown at all (`is-waiting` / `is-revealed` CSS classes), so they never flash at a starting size and then jump — they fade in once ready (`nc-reveal` animation, skipped under `prefers-reduced-motion`).
- Below 600px width the card becomes a full-width bottom sheet instead of a floating window
- Escape closes a pinned card (unless a lightbox is open, which claims Escape first)
- An unpinned (hover) card ignores pointer events so it can never swallow the `mouseleave`/click on the tag that opened it

## Customising

Card sizing constants (`ALBUM_SIZE`, `ARTIST_SIZE`, `EVENT_SIZE`/`EVENT_MIN_H`/`EVENT_MAX_H`, `USER_SIZE`, `MIN_SIZE`, `SHEET_QUERY`) and the title-bar labels (`CARD_LABELS`) are at the top of `NavidromeCard.tsx`. Styling is in `navidromeCard.css`; track list rows reuse `stickerPlayer.css` classes (`sp-tracks`, `sp-track`) so both players look identical; the event and user card bodies reuse the profile-bubble classes (`ul-*`) from `UserCardBody.css`.

To add a new card type: extend `CardTarget['type']` in `useNavidromeCard.tsx`, add a size constant and a `CARD_LABELS` entry, and render its body component inside `NavidromeCard`'s `.nc-body`. If the new body can host inner tags the way the event card does, wrap it in `CardHostContext.Provider`.
