# ForumMessageBox

**File:** `src/components/basic/ForumMessageBox.tsx`

A compose box for the message board, film club board, news page, issues board and the calendar's event-linked posts. Supports `@` tagging for members and Navidrome artists/albums, `/` slash commands for linking to community resources and triggering admin bot posts, image attachments, and poll composing.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `placeholder` | `string` | Placeholder text (default: `"Type your message..."`) |
| `onSend` | `(text: string) => void` | Called with the message text when the user submits |
| `disabled` | `boolean` | Disables the input and send button |
| `maxWords` | `number` | Word limit (default: 250) |
| `maxChars` | `number` | Character limit (default: 1000) |
| `className` | `string` | Extra class on the outer container |
| `showSendButton` | `boolean` | Show or hide the Send button (default: `true`) |
| `initialValue` | `string` | Pre-fills the textarea (used when editing a post) |
| `onImageAttach` | `(file: File \| null) => void` | Called when the user pastes, picks, or drops an image; passes the File or null when removed |
| `onFilmAnnounce` | `(variant: 1 \| 2 \| 3) => Promise<void>` | Optional. When provided (admins only), exposes `/filmannounce1`/`2`/`3` to post current-film / voting-reminder / next-film bot announcements |
| `onEventAnnounce` | `() => Promise<void>` | Optional. When provided (admins only, on boards listed in `EVENT_BOT_BOARDS`), exposes `/eventbot` to post the calendar's weekly round-up |
| `onPollAttach` | `(poll: PollDraft \| null) => void` | Optional. When provided, exposes `/poll` which opens `PollComposeModal` and attaches the resulting draft to the next send |
| `avatar` | `string` | The signed-in user's avatar, drawn beside the field on boards that lay the composer out as a post (e.g. issues) |
| `avatarName` | `string` | Name shown under that avatar; only read when `avatar` is set |
| `outsideControls` | `boolean` | Puts the send button, attach button and word counter in a row under the field instead of inside it |
| `crossPost` | `{ label, checked, onChange }` | A tick box drawn with the controls — sub-boards use it to offer cross-posting to the main board |

## Tagging

### `@` — Member / artist / album search

Type `@` (at word start) followed by at least 3 characters. Two sources are searched in parallel:

- **Members** — matched from the first letter against the directory (`getAllUserProfiles`, loaded once and cached), sorted with prefix matches first, up to 5 shown.
- **Navidrome library** — via `searchLibrary` (`src/utils/navidromeSearch.ts`), up to 3 artists and 3 albums.

Clicking a member inserts `[@Name](https://yabbyville.xyz/user/:id)`; clicking an artist/album inserts `[Name](navidrome link)`. Both are Markdown-style links that `parseMessageHTML` (`src/components/basic/messageText.tsx`) later renders as hover/pin cards.

### `/` — Slash commands

Type `/` (at word start) to open the command menu. Three categories of commands are available:

**Action commands** — trigger a side-effect rather than inserting a link (admin only, and only when the matching handler prop is supplied):

| Command | Effect |
|---------|--------|
| `/filmannounce1` | Announce the current month's film (`onFilmAnnounce(1)`) |
| `/filmannounce2` | Remind of the voting deadline (`onFilmAnnounce(2)`) |
| `/filmannounce3` | Announce next month's film (`onFilmAnnounce(3)`) |
| `/eventbot` | Post this week's calendar round-up (`onEventAnnounce`) |
| `/poll` | Open the poll composer (`onPollAttach`, any signed-in poster) |

**Instant links** — insert a direct link to a community page:

| Command | Links to |
|---------|----------|
| `/filmclub` | Film Club page |
| `/radio` | Radio page |
| `/news` | News page |
| `/stickers` | Stickers page |
| `/wiki` | Wiki page |
| `/issues` | Issues page |

**Search commands** — open a search mode to find and link a specific item:

| Command | Searches |
|---------|---------|
| `/list <query>` | Public community lists |
| `/playlist <query>` | Navidrome public playlists |
| `/travel <query>` | Travel recommendations (places) |
| `/city <query>` | Cities with travel recs (links to filtered travel view) |
| `/issueresolved <query>` | Existing issues (links to a specific issue) |

All results are inserted as Markdown links `[Name](url)`.

## Images

Attaching is offered whenever `onImageAttach` is provided, via paste, the "▓ attach" file picker, or drag-and-drop onto the box. Files are checked client-side against 8 MB and an `image/*` MIME type (looser than the server's own allow-list, since some platforms misreport HEIC); the server is the real gate. One image at a time — attaching a new one replaces the pending preview.

## Usage

```tsx
<ForumMessageBox
  placeholder="Share your thoughts..."
  onSend={(text) => postMessage(text)}
  maxWords={250}
  onImageAttach={(file) => setPendingImage(file)}
  onEventAnnounce={isAdmin ? handleEventAnnounce : undefined}
  onPollAttach={setPendingPoll}
/>
```

## Customising

- To add a new instant slash command, add an entry to `INSTANT_COMMANDS`.
- To add a new search command, add the key to `SEARCH_COMMANDS`/`SEARCH_COMMAND_LABELS`/`SLASH_MODE_LABELS` and handle it in the reactive `useEffect` that populates `slashResults`.
- To add a new admin action command, follow the `EVENT_BOT_COMMAND` pattern: a prop, a constant id, an entry pushed into `actionMatches` in both the "typing" and "trailing space" branches of `handleInputChange`, and a branch in `selectResult`.
- Member and library search both go through shared caches (`getAllUserProfiles` in `userCache.ts`, `searchLibrary` in `navidromeSearch.ts`) — a session that has already opened the directory or tagged someone pays nothing more.
