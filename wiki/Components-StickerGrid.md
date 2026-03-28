# StickerGrid

**File:** `src/components/StickerGrid.tsx`

Displays all albums with stickers as a grid. Clicking an album opens a popup showing the stickers placed on it.

## Props

- `sortMode` - `'chronological'` (newest first) or `'shuffle'` (random)
- `shuffleKey` - increment this number to trigger a re-shuffle

## Features

- Fetches stickers from Firestore grouped by album
- Overlays sticker avatars on album covers at their saved positions
- Pagination (loads more albums as you scroll or click)
- Popup view with sticker messages and a "Place Sticker" button

## Usage

```tsx
<StickerGrid sortMode="chronological" shuffleKey={0} />
```

## Components Used

- `UserMessages` - displays sticker details in the popup
- `PlaceSticker` (popup mode) - for placing new stickers from the popup
