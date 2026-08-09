# PlayerBar

**File:** `src/components/PlayerBar.tsx`
**CSS:** `src/components/PlayerBar.css`
**State:** `src/utils/usePlayer.tsx`, `src/utils/useAudioEngine.tsx`

The site's single audio player, mounted once in the home shell's bottom bar so it
survives route changes. Replaced the old Webamp / `RadioPlayer` / `StickerAlbumPlayer`
split — there is now one transport with two **modes**, and starting one source
stops the other.

## Modes

| Mode | Source | Transport |
|---|---|---|
| `library` (default) | Navidrome album, streamed via Subsonic | prev / play / next, seek bar, time, queue popup, volume |
| `radio` | `https://radio.yabbyville.xyz/live` | play, volume — a live stream has nothing to seek to or skip |

Both render the same three rows (`MetaRow`, seek row, control row) so switching
mode cannot rearrange the bar. In radio mode an ascii `RadioSet` stands in for the
seek bar, its arcs pulsing only while the stream actually runs.

## State

`PlayerProvider` (`usePlayer.tsx`) wraps the app and owns everything. Consumers use
two hooks, split so a component re-rendering on time updates doesn't drag the
action-only ones with it:

- `usePlayerState()` — `mode`, `album`, `tracks`, `index`, `currentTime`,
  `duration`, `radio`, `isPlaying`, `volume`, `muted`, `vizOpen`, `vizFullscreen`
- `usePlayerActions()` — `playAlbum`, `toggle`, `next`, `prev`, `seek`, `stop`,
  `setVolume`, `toggleMute`, `enterRadio`, `enterLibrary`, `setVizOpen`

Also exported: `formatTime(seconds)` → `mm:ss`, and `loadAlbumTracks(albumId)`,
which shares `navidromeCards`' promise cache with the hover cards so opening a card
and then playing from it is a single `getAlbum`.

Anything that starts playback — sticker popups, album carousels, Navidrome cards —
calls `playAlbum` from the context rather than mounting a player of its own.

## Audio engine

`useAudioEngine` owns the single `AudioContext`, the two source nodes (library
element and radio element) and the butterchurn canvas. butterchurn and its presets
are **dynamically imported** on first visualiser open, so neither is in the initial
bundle. butterchurn 2.6 has no re-init hook, so the canvas is rebuilt rather than
resized.

`useRadioMetadata(enabled)` polls now-playing for radio mode and reports `error`
when the stream is down, so the meta line can say `stream offline` instead of
sitting on `tuning in…`.

## Visualiser

The `[ viz ]` switch lives in the player; the canvas lives in `VisualiserDock`,
mounted separately in `Home.tsx`'s bottom bar. Mounting is gated on
`min-width: 901px` in JS — see [Pages-Home](Pages-Home). Opening it fires the
`viz_open` umami event.

## Queue popup

Library mode only. `☰` opens a `role="dialog"` listing the queued album's tracks
with the current one marked; Escape or `✕` closes, `clear` empties the queue.

## Props

| Prop | Type | Purpose |
|---|---|---|
| `trailing` | `React.ReactNode` | Dropped in at the end of the control row in either mode. `Home.tsx` uses it for `AsciiMan`, so he sits with the controls while the seek bar and metadata still run to the bar's edge. |

## Customising

- **Stream URL:** `RADIO_STREAM_URL` in `usePlayer.tsx`.
- **Block-meter granularity:** `SEEK_CELL_PX` / `SEEK_MIN_BLOCKS` /
  `VOLUME_CELL_PX` / `VOLUME_MIN_BLOCKS` in `basic/BlockRange.tsx`.
- **Radio ascii set:** the `RadioSet` template literal in `PlayerBar.tsx`.
