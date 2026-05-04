# ForumMessageBox

**File:** `src/components/basic/ForumMessageBox.tsx`

A compose box for the message board and news page. Supports `@` tagging for Navidrome artists/albums and `/` slash commands for linking to community resources.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `placeholder` | `string` | Placeholder text (default: `"Type your message..."`) |
| `onSend` | `(text: string) => void` | Called with the message text when the user submits |
| `disabled` | `boolean` | Disables the input and send button |
| `maxWords` | `number` | Word limit (default: 250) |
| `maxChars` | `number` | Character limit (default: 1000) |
| `showSendButton` | `boolean` | Show or hide the Send button (default: `true`) |
| `initialValue` | `string` | Pre-fills the textarea (used when editing a post) |
| `onImageAttach` | `(file: File \| null) => void` | Called when the user pastes an image; passes the File or null when removed |

## Tagging

### `@` — Artist / album search

Type `@` (at word start) followed by at least 3 characters to search Navidrome. Up to 3 artists and 3 albums are shown. Clicking a result inserts a Markdown link `[Name](url)` at the cursor.

### `/` — Slash commands

Type `/` (at word start) to open the command menu. Two categories of commands are available:

**Instant links** — insert a direct link to a community page:

| Command | Links to |
|---------|----------|
| `/filmclub` | Film Club page |
| `/radio` | Radio page |
| `/news` | News page |
| `/stickers` | Stickers page |
| `/wiki` | Wiki page |

**Search commands** — open a search mode to find and link a specific item:

| Command | Searches |
|---------|---------|
| `/list <query>` | Public community lists |
| `/playlist <query>` | Navidrome public playlists |
| `/travel <query>` | Travel recommendations (places) |
| `/city <query>` | Cities with travel recs (links to filtered travel view) |

All results are inserted as Markdown links `[Name](url)`.

## Usage

```tsx
<ForumMessageBox
  placeholder="Share your thoughts..."
  onSend={(text) => postMessage(text)}
  maxWords={250}
  onImageAttach={(file) => setPendingImage(file)}
/>
```

## Customising

- To add a new instant slash command, add an entry to `INSTANT_COMMANDS` in `ForumMessageBox.tsx`.
- To add a new search command, add the key to `SEARCH_COMMANDS` and handle it in the reactive `useEffect` that populates `slashResults`.
