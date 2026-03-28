# StickerGrid

**File:** `src/components/StickerGrid.tsx`

Displays all albums with stickers as a grid. Clicking an album opens a popup showing the stickers placed on it.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `sortMode` | `'chronological' \| 'shuffle'` | Sort order for the grid |
| `shuffleKey` | `number` | Increment to trigger a fresh shuffle |
| `filterUserId` | `string` (optional) | When set, only shows albums that contain at least one sticker from this user |
| `onUsersLoaded` | `(users: StickerUser[]) => void` (optional) | Called once on initial load with the deduplicated, alphabetically sorted list of all users who have placed stickers |

`StickerUser` is exported from this file:

```ts
export interface StickerUser {
  userId: string;
  username: string;
}
```

## Features

- Fetches all stickers from Firestore grouped by album, sorted by most-recent sticker timestamp
- Overlays sticker avatars on album covers at their saved positions
- Client-side user filter: albums are hidden unless they contain a sticker from `filterUserId`
- Pagination: 50 albums per page, "Load More" button shows remaining count
- Popup view with sticker messages and a "Place Sticker" button
- If the current user already has a sticker on the album being viewed in placement mode, `PlaceStickerCore` shows a notice but still permits adding another one

## Usage

```tsx
<StickerGrid
  sortMode="chronological"
  shuffleKey={0}
  filterUserId="abc123"
  onUsersLoaded={(users) => setAvailableUsers(users)}
/>
```

## Components Used

- `UserMessage` — displays each sticker entry (avatar, username, message, timestamp) in the popup
- `PlaceSticker` (popup mode) — for placing new stickers from the popup

## Customising

Change `ALBUMS_PER_PAGE` (currently 50) to adjust how many albums load at once. User data is resolved via the shared `getUserData` util from `src/utils/userCache.ts` with a 5-minute TTL.
