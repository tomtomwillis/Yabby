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

## Customising

### Adding avatars

Avatar options are defined in a data file that maps shapes to available colours. To add new avatars:

1. Add `avatar_{shape}_{colour}.webp` images (1000x1000) to `public/Stickers/`
2. Update the avatar options data to include the new shape/colour combinations
3. The `AvatarPreview` component will automatically show the new options

### Changing profile fields

Profile fields are validated both client-side and in `firestore.rules`. If you add or remove fields, update both places.
