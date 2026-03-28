# User Profile Page

**File:** `src/pages/UserProfile.tsx`
**Route:** `/user/:userId`

A public-facing profile page for any community member, accessible by their Firestore user ID.

## What It Shows

- **Avatar** — the user's chosen sticker image (120×120px). Falls back to a coloured circle with the user's initial if no avatar is set.
- **Bio** — free-text bio from `users/{userId}.bio`. Shows an italicised placeholder if empty.
- **Location** — optional flag emoji and location text, separated from the bio by a dashed line.
- **Edit Profile button** — shown only if the viewer is looking at their own profile; links to `/profile`.

## Data Fetching

Reads a single document from `users/{userId}` on mount. Also listens to `auth.onAuthStateChanged` to correctly detect whether the viewer owns the profile, since the auth state may not be ready immediately.

Avatar paths are normalised to `/Stickers/filename` regardless of how they were stored (with or without leading slash, with or without the `Stickers/` prefix).

## Components Used

- `Header` — displays the username as the page title
- `Button` — "Edit Profile" link button

## Customising

- To add more profile fields (e.g. favourite genre, join date), add the fields to the `users` Firestore document and update the `fetchProfile` function and JSX in `UserProfile.tsx`.
- Profile field validation and write permissions are enforced by Firestore security rules on the `users` collection.
