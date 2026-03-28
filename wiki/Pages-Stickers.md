# Stickers Page

**File:** `src/pages/Stickers.tsx`
**Route:** `/stickers`

A gallery of all albums that have stickers placed on them.

## What It Shows

- Album search bar (`PlaceSticker` in `inline-url` mode) at the top for placing new stickers
- Sort controls: "Newest First" and "Shuffle"
- A user filter dropdown (shown once stickers have loaded) to narrow the grid to albums stickered by a specific member
- The full sticker grid with pagination

## Components Used

- `StickerGrid` — grid display with sorting, filtering, and pagination
- `PlaceSticker` (in `inline-url` mode) — album search at the top of the page

## Filter by User

When `StickerGrid` finishes loading it calls back with the list of unique users who have placed stickers (`onUsersLoaded`). The page stores this list and renders a `<select>` dropdown. Choosing a user passes their `userId` down as `filterUserId` to `StickerGrid`, which then only shows albums that contain at least one sticker from that user.

## How Stickers Work

Each sticker is a Firestore document with:
- The album it's on (ID, title, artist)
- A position (normalised x/y coordinates, so they display correctly at any screen size)
- The user's avatar image
- A text message
- An optional favourite track from the album

Users drag their avatar onto the album cover to choose a position, then write a message.

## Customising

To change the number of albums loaded per page, update `ALBUMS_PER_PAGE` in `StickerGrid.tsx`. To style the filter dropdown, edit the inline styles on the `<select>` element in this page.
