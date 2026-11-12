# Profile Page

**File:** `src/pages/Profile.tsx`
**Route:** `/profile`

Where users edit their profile details. There is also a public profile view at `/user/:userId` (`UserProfile.tsx`).

## What Users Can Edit

- **Username** (2-20 characters, alphanumeric plus spaces, hyphens, underscores)
- **Avatar** - select a shape and colour combination from the available sticker images
- **Bio** - short text bio (max 500 characters, sanitised HTML)
- **Location** - a flag emoji and text
- **Password** - reset via Firebase email
- **Oneko cat** - toggle the interactive cat that follows your cursor
- **Music account** - link your own Navidrome account (see below)

## Music Account

**File:** `src/components/MusicAccount.tsx` (client: `src/api/musicAccount.ts`)

A row in the account list, shown only when `GET /api/music/account` answers `enabled: true` (nothing while loading, when off, or on any error). Linking makes the site's player play as the member's own Navidrome user, so plays and history are theirs, and gives them a generated **music password** for phone apps.

- **Not linked** - Navidrome username and current password, then a confirm step. Linking replaces the Navidrome password, so phone apps must be given the new one. The password field is cleared as soon as it is sent.
- **Just linked / regenerated** - the music password is shown once, with the server address, the username and a copy button. `done` drops it; it is never stored anywhere.
- **Linked** - when the password was set, whether the player here is on the member's account, `regenerate` and `unlink` (both confirmed).
- **Stale** - the music password no longer works and the player has fallen back to the shared account. `regenerate music password` comes first, since it also recovers a password change whose answer was lost. Only if that is refused (409) is `unlink and link again` offered, with no confirm. An unlink the server refuses because a password change is unconfirmed shows its reason inline.
- **Switched off, still linked** - `{ enabled: false, linked: true }`: a line saying the feature is off for now and a confirmed `unlink`.

Each change mints a fresh music session, so the player switches account at once. Umami events: `music-account-linked`, `music-password-regenerated`, `music-account-unlinked`.

## Customising

### Adding avatars

Avatar options are defined in a data file that maps shapes to available colours. To add new avatars:

1. Add `avatar_{shape}_{colour}.webp` images (1000x1000) to `public/Stickers/`
2. Update the avatar options data to include the new shape/colour combinations
3. The `AvatarPreview` component will automatically show the new options

### Changing profile fields

Profile fields are validated both client-side and in `firestore.rules`. If you add or remove fields, update both places.
