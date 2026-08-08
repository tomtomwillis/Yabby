# StickerAlbumPlayer

**Files:** `src/components/StickerAlbumPlayer.tsx`, `src/components/StickerMiniBar.tsx`, `src/utils/useStickerPlayer.tsx`

Playback for albums tagged on stickers. Three pieces share one playback context:

- **`StickerAlbumPlayer`** (default export) — the "Click to Listen" accordion shown inside a sticker's popup (`StickerGrid`, `CarouselStickers`). Expanding it lazily loads and shows the album's track list; clicking a track starts playback.
- **`StickerTransport`** (named export) — play/pause, prev/next, seek and volume controls, rendered as ASCII block meters (`BlockRange`) that resize to fill their container via `ResizeObserver`.
- **`StickerMiniBar`** — the persistent bottom dock. Mounted once in `App.tsx`; renders nothing until an album is playing, so it costs nothing when idle. Hosts `StickerTransport` plus a track title, a toggleable queue panel, and stop/close buttons.

This is a **different** popup from [NavidromeCard](Components-NavidromeCard) (used for `@`-tagged albums in the message board and the Home page's Recently Added carousel) — different frame, different trigger — but both call into the same `useStickerPlayer` context, so starting playback from either one continues in the same mini-bar.

## `useStickerPlayer()`

Context hook backed by `StickerPlayerProvider` (mounted in `App.tsx`, wrapping an `<audio>` element):

```ts
const {
  album, tracks, index, isPlaying, currentTime, duration, volume,
  playAlbum, toggle, next, prev, seek, setVolume, stop,
} = useStickerPlayer();
```

- `playAlbum(album, startTrackId?)` — loads the album's track list (via `loadAlbumTracks`, which shares `navidromeCards`' promise cache with the hover cards) and starts playing, optionally from a specific track. Fires `sticker_player_play` to Umami.
- `toggle` / `next` / `prev` / `seek(seconds)` / `setVolume(v)` — standard transport controls, backed by the single shared `<audio>` element.
- `stop` — pauses, fully unloads the `<audio>` src (so the browser aborts buffering rather than re-requesting), and clears all player state — this is what makes the mini-bar unmount.
- `duration` — reports the track's known Subsonic duration until the browser's `loadedmetadata` fires, so the transport never flashes `0:00`.

## Usage

```tsx
<StickerAlbumPlayer
  albumId={albumId}
  albumTitle={title}
  albumArtist={artist}
  favoriteTrackIds={['track1', 'track2']} // starred with ★ in the track list
/>
```

`favoriteTrackIds` is used by `StickerFavoritePlay`, a standalone inline ▶ button (also exported from this file) shown beside a sticker's saved favourite track, so playback can start without expanding the accordion.

## Customising

Block-meter sizing (`SEEK_CELL_PX`/`SEEK_MIN_BLOCKS`, `VOLUME_CELL_PX`/`VOLUME_MIN_BLOCKS`) is at the top of `StickerAlbumPlayer.tsx`. All player styling — transport, track lists, dock, queue panel — lives in `stickerPlayer.css` and is shared with `NavidromeCard`.
