# Media Management

This page gives an architectural overview of the media management section of Yabbyville. It covers the frontend components, backend API, authentication flow, and environment configuration.

## Purpose

Media management tools allow authorised media managers to maintain the music library. Currently there are two tools:

- **Cover Art Tool** — search for an album and replace its cover art image
- **Beets Import** — interactively import new music into the beets-managed library via a WebSocket terminal

## Access

- **Route:** `/media`
- **Requires:** Firebase authentication **and** media manager role
- The `useMediaManager` hook checks the Firestore `mediaManagers` collection for the current user's UID. If the document does not exist, the page shows "Access Denied".
- Media manager documents must be created manually in the Firebase Console.

## Architecture

### Frontend

`MediaManager.tsx` is a tabbed container that gates on the media manager permission. It renders one of two child components depending on the active tab:

| Tab | Component | Description |
|-----|-----------|-------------|
| Cover Art | `CoverArtTool` | REST-based album cover updater |
| Beets Import | `BeetsTerminal` | WebSocket-based interactive terminal |

### Backend

An Express.js API server (not part of this repository) runs at `/api/media` and provides:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/media/update-cover` | POST | Fetch an image URL, process it, and write it as the album's cover art |
| `/api/media/beets/session-status` | GET | Check whether a beets import session is already active |
| `/api/media/beets/folders` | GET | List folders available for import |
| `/api/media/beets/terminal` | WebSocket | Interactive beets import session with streaming output and prompt relay |

### Auth Flow

1. The frontend calls `auth.currentUser.getIdToken(true)` to get a fresh Firebase ID token.
2. REST requests send the token as `Authorization: Bearer <token>`.
3. WebSocket connections pass the token as a `?token=` query parameter.
4. The backend verifies the token with Firebase Admin SDK and checks the `mediaManagers` Firestore collection before granting access.

### WebSocket Protocol

**Server to client messages:**

| Type | Description |
|------|-------------|
| `connected` | Handshake complete, client may request folder list |
| `locked` | Another user has an active session |
| `error` | Generic error |
| `output` | Streaming terminal output line |
| `prompt` | Beets is waiting for user input; includes allowed response keys |
| `folders` | Available folders grouped by base path |
| `import_started` | Import process has begun |
| `import_finished` | Import process completed (success or failure) |
| `idle_warning` | Session approaching idle timeout |
| `session_timeout` | Session terminated due to inactivity |
| `pong` | Keepalive response |

**Client to server messages:**

| Type | Description |
|------|-------------|
| `list_folders` | Request available folders |
| `start_import` | Begin import with selected folder paths |
| `input` | Send a response to a beets prompt |
| `abort` | Cancel the running import |
| `ping` | Keepalive |

## Components

- [MediaManager (page)](Pages-MediaManager) — tab container and permission gate
- [CoverArtTool](Components-CoverArtTool) — cover art update tool
- [BeetsTerminal](Components-BeetsTerminal) — interactive beets import terminal

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `VITE_MEDIA_API_URL` | Base URL for the media management REST API (defaults to `/api/media`) |
| `VITE_MEDIA_WS_URL` | WebSocket URL for the beets terminal (defaults to deriving from `window.location`) |

## Dev Proxy

During local development, `vite.config.ts` proxies both REST and WebSocket requests:

- `/api/media/beets/terminal` is proxied as a WebSocket connection (must be listed before the general rule)
- `/api/media` is proxied as a standard HTTP request
