# Directory Page

**File:** `src/pages/DirectoryPage.tsx`
**Route:** `/directory`

A member directory: every user with a profile, listed alphabetically by username with an A–Z jump nav.

## What It Shows

- **Bar** — "members" label and a live count.
- **A–Z jump nav** — one button per letter (plus `#` for anything that doesn't start with a letter after accents are folded away, e.g. é sorts under E); disabled when no member falls under it. Clicking scrolls to that letter's first entry.
- **One row per member** — avatar (falls back to a coloured initial), username (links to `/user/:userId`), join month/year, bio (or "no bio yet."), location, post/sticker counts (sticker count links to `/stickers?user=:userId`), and any connected social handles/site link.

## Data Fetching

Reads the whole directory in one call via `getAllUserProfiles()` (`src/utils/userCache.ts`) — the same shared, cached read `ForumMessageBox`'s `@` member search uses, so a session that has already opened the composer's tagging pays nothing more here (and vice versa).

## Hiding accounts

Test and system accounts are hidden cosmetically (their profiles are still readable by anyone who has the direct `/user/:userId` link) via the `VITE_DIRECTORY_HIDDEN_UIDS` env var — a comma-separated list of uids, kept out of the repo rather than hardcoded.

## Components Used

- `Header` — page title/subtitle
- `SiteLink` — personal site link
- `SocialHandle` — one per connected social platform

## Customising

- Letters a name can be filed under: `letterFor()`.
- To hide more accounts, add their uid to `VITE_DIRECTORY_HIDDEN_UIDS` (comma-separated) rather than editing this file.
