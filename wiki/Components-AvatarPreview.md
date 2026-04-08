# AvatarPreview

**File:** `src/components/AvatarPreview.tsx`

Dropdown UI for selecting and previewing avatars. Used on the Profile page.

## How It Works

Avatar options are defined in a data structure that maps each shape to its available colours. When a shape is selected, the colour dropdown automatically filters to show only valid options for that shape. The preview updates in real time as selections change.

Selections are stored in Firestore on the user's profile document.

## Adding New Avatars

1. Add `avatar_{shape}_{colour}.webp` (1000×1000px) to `public/Stickers/`
2. Update the `avatarOptions` data structure to include the new entries
3. The dropdown and preview will reflect the new options automatically
