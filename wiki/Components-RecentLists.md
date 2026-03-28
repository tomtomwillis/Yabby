# RecentLists

**File:** `src/components/RecentLists.tsx`

Displays up to three recently updated public lists as clickable cards. Clicking a card navigates directly to that list's detail page.

## Usage

```tsx
<RecentLists />
```

No props. Used on the Home page beneath the Lists heading.

## What It Shows

Each card shows:
- A preview image — either the most recent item's album art or custom image, falling back to the contributor's avatar sticker
- The list title

On mobile (viewport `< 768px`) only two cards are shown instead of three.

## Data Fetching

1. Queries the `lists` collection ordered by `lastUpdated` descending (up to 10 results) and takes the first three public lists.
2. If fewer than three are found (e.g. older lists lack `lastUpdated`), a second query ordered by `timestamp` fills the gap; for those legacy lists the component fetches the most recent item with an image on-the-fly.
3. Private lists (`isPublic === false`) are skipped.

## Customising

- To change the number of cards displayed, edit the `>= 3` / `>= 2` limit checks and the `displayedLists` slice in `RecentLists.tsx`.
- Card appearance is in `RecentLists.css`.