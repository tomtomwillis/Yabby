# Stickers Page

**File:** `src/pages/Stickers.tsx`
**Route:** `/stickers`

A gallery of all albums that have stickers placed on them.

## Features

- Grid layout showing album covers with stickers overlaid at their saved positions
- Two sort modes: chronological (newest first) and shuffle (random order)
- Click an album to see all its stickers and the messages left with them
- Place a new sticker on any album directly from this page
- Pagination for large collections

## Components Used

- `StickerGrid` - the grid display with sorting and pagination
- `PlaceSticker` (in `inline-url` mode) - album search at the top of the page
- `UserMessages` - displays sticker messages in the popup

## How Stickers Work

Each sticker is a Firestore document with:
- The album it's on (ID, title, artist)
- A position (normalised x/y coordinates, so they display correctly at any screen size)
- The user's avatar image
- A text message
- An optional favourite track from the album

Users drag their avatar onto the album cover to choose a position, then write a message.
