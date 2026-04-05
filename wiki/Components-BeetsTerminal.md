# BeetsTerminal

**File:** `src/components/media/BeetsTerminal.tsx`

An interactive WebSocket-based terminal for importing music into the beets library.

## Props

This component takes no props.

## Usage

```tsx
<BeetsTerminal />
```

Rendered inside the Media Manager page when the "Beets Import" tab is active.

## How It Works

The component connects to a WebSocket endpoint and moves through several states:

| State | What happens |
|-------|-------------|
| `connecting` | Authenticates and opens a WebSocket connection |
| `folder_select` | Displays available folders grouped by base path with checkboxes for selection |
| `importing` | Streams beets terminal output in a scrollable `<pre>` block and shows prompt buttons when beets asks a question |
| `finished` | Import complete; option to start a new import |
| `locked` | Another user already has an active session; option to retry |
| `error` | Connection or auth failure; option to retry |
| `disconnected` | WebSocket closed unexpectedly; option to reconnect |

### Session Locking

Only one beets import session can run at a time. Before connecting, the component checks `/api/media/beets/session-status`. If a session is active, it shows who is using the tool and offers a retry button.

### Prompt Buttons

When beets asks a question (e.g. "Apply, Skip, Abort?"), the server sends a `prompt` message with the allowed response keys. The component renders labelled buttons for common beets options:

| Key | Label |
|-----|-------|
| a | Apply |
| s | Skip |
| b | Abort |
| m | More |
| k | Keep |
| r | Remove |
| y | Yes |
| n | No |
| g | Group |
| e | Edit |
| t | as Tracks |
| u | Resume |

### Idle Timeout

Sessions have a 10-minute idle timeout. A countdown timer is displayed during import. When 2 minutes remain, a warning style is applied. The server sends `idle_warning` and `session_timeout` messages to keep the client in sync.

### Keepalive

A `ping` message is sent every 30 seconds to prevent the WebSocket from being closed by proxies or load balancers.

### Auto-scroll

The terminal output area auto-scrolls to the bottom as new lines arrive. If the user scrolls up to review earlier output, auto-scroll pauses and resumes when they scroll back within 40px of the bottom.

## Components Used

- `Button` — action buttons (start import, retry, reconnect, new import)

## Customising

- The REST API base URL is set by `VITE_MEDIA_API_URL` (defaults to `/api/media`).
- The WebSocket URL is set by `VITE_MEDIA_WS_URL` (defaults to deriving from the current page location).
- Idle timeout and ping interval are constants at the top of the file (`IDLE_TIMEOUT_SECONDS`, `PING_INTERVAL_MS`).
- Prompt button labels can be extended by adding entries to the `PROMPT_LABELS` map.
- Styles are in `src/components/media/BeetsTerminal.css`.
