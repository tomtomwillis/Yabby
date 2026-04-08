# PlaceSticker & PlaceStickerCore

**Files:** `src/components/PlaceSticker.tsx` and `src/components/PlaceStickerCore.tsx`

The sticker placement system. Users drag their avatar onto an album cover and write a message.

## Architecture

- **PlaceStickerCore** - contains all the shared logic: drag and drop, coordinate normalisation, Firestore submission, user sticker fetching
- **PlaceSticker** - a wrapper that provides three different modes using PlaceStickerCore

## Modes

### `url-input` (default - Home page)

Shows an `AlbumSearchBox`. User searches or pastes a URL, then a popup opens for sticker placement.

```tsx
<PlaceSticker />
```

### `popup` (CarouselStickers, StickerGrid)

Receives album info as props and opens directly in popup mode. Includes a back button.

```tsx
<PlaceSticker
  mode="popup"
  albumInfo={album}
  isVisible={true}
  onClose={handleClose}
  onBack={handleBack}
  showBackButton={true}
/>
```

### `inline-url` (Stickers page)

Shows an `AlbumSearchBox` without a container. Opens a popup when an album is selected.

```tsx
<PlaceSticker mode="inline-url" />
```

## How Sticker Positions Work

Positions are stored as normalised coordinates in a 0–300 range (the `ALBUM_DISPLAY_SIZE` constant exported from `PlaceStickerCore`) relative to the album cover. `StickerGrid` converts these back to CSS percentages when rendering. This ensures stickers display in the same relative position regardless of the rendered image size.
