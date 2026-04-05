# CoverArtTool

**File:** `src/components/media/CoverArtTool.tsx`

Lets a media manager search for an album and replace its cover art by providing an image URL.

## Props

This component takes no props.

## Usage

```tsx
<CoverArtTool />
```

Rendered inside the Media Manager page when the "Cover Art" tab is active.

## How It Works

The component moves through a series of stages:

| Stage | What happens |
|-------|-------------|
| `search` | User searches for an album using `AlbumSearchBox`, or pastes a Navidrome album URL |
| `preview` | Shows the current cover art, album title/artist, and an input for the new image URL with a live preview |
| `processing` | Sends a POST request to `/api/media/update-cover` with the album ID and image URL |
| `success` | Displays confirmation with format conversion details and processed file size |
| `error` | Shows the error message with options to retry or start over |

### Authentication

Uses `auth.currentUser.getIdToken(true)` to obtain a Firebase ID token, sent as a Bearer token in the REST request. The backend verifies the token and checks media manager permissions.

### Rate Limiting

Uses the `useRateLimit` hook (5 attempts per 10-minute window) to prevent excessive requests.

### URL Validation

The image URL is validated with `validateUrl` from `src/utils/sanitise.ts` before the preview is shown.

## Components Used

- `AlbumSearchBox` — album search with autocomplete and URL paste support
- `Button` — action buttons (change album, update, retry, start over)

## Customising

- The media API base URL is set by `VITE_MEDIA_API_URL` (defaults to `/api/media`).
- Rate limit parameters are configured in the `useRateLimit` call at the top of the component.
- Styles are in `src/components/media/CoverArtTool.css`.
