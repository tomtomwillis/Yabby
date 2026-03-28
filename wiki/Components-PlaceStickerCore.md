# PlaceStickerCore

**File:** `src/components/PlaceStickerCore.tsx`

The shared logic layer for sticker placement. Handles album cover rendering, sticker drag-and-drop, track selection, and Firestore submission. Used directly by `PlaceSticker`.

For a higher-level description of the placement system and its three modes, see [PlaceSticker](Components-PlaceSticker).

## Props

| Prop | Type | Description |
|------|------|-------------|
| `albumInfo` | `{ id, artist, title, cover }` | Album to place the sticker on |
| `onSuccess` | `() => void` (optional) | Called after a successful submission; defaults to `window.location.reload()` |
| `onClose` | `() => void` (optional) | If provided, renders a close button that calls this |
| `showBackButton` | `boolean` (optional, default `false`) | Renders an arrow-left back button |
| `onBack` | `() => void` (optional) | Called when the back button is clicked |
| `showAlbumInfo` | `boolean` (optional, default `false`) | Shows "Artist - Title" below the album cover |

## How It Works

1. On mount, fetches the current user's avatar from Firestore and the album's track list from Navidrome via the Subsonic API.
2. It also queries Firestore to check whether the current user has already placed a sticker on this album. If they have, a notice is shown ("You already have a sticker on this album. You can still add another one!"). Placing a duplicate sticker is permitted.
3. The user clicks the album cover to place their avatar sticker, then drags it to reposition.
4. Sticker positions are stored as normalised coordinates in a 0–300 range (`ALBUM_DISPLAY_SIZE`), independent of the rendered image size. On load, `StickerGrid` converts these back to percentages for display.
5. The user optionally selects a favourite track from a dropdown, then writes a message and submits.
6. On submit, a document is written to the `stickers` Firestore collection with `userId`, `albumId`, `text`, `position`, `sticker` (avatar path), `timestamp`, and optionally `favoriteTrackId`/`favoriteTrackTitle`.

## Exported Constants

```ts
export const ALBUM_DISPLAY_SIZE = 300; // normalised coordinate space
export const STICKER_SIZE = 100;       // sticker size within that space
```

These are used by `StickerGrid` to convert stored coordinates back to display percentages.
