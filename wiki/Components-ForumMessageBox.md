# ForumMessageBox

**File:** `src/components/basic/ForumMessageBox.tsx`

A compose box for the message board, film club board, news page, issues board and the calendar's event-linked posts. Supports `@` tagging for members, `/` commands for linking music, events and community resources and triggering admin bot posts, image attachments, and poll composing.

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

The `@` and `/` menu comes from the shared `useTagging` hook (`src/components/basic/tagging/`), the same one [TagTextarea](Components-TagTextarea) uses, so every tagging box on the site behaves alike. The command set and its parsing live in `src/utils/tagCommands.ts` (tested in `tests/tag-commands/`); the data each command searches is loaded on first use and shared by every box on the page (`tagSources.ts`).

- `@name` — members only, matched from the first letter. Inserts `[@Name](https://yabbyville.xyz/user/:id)`.
- `/` — the command menu. Search commands (`/artist`, `/album`, `/track` or `/song`, `/playlist`, `/list`, `/event` or `/calendar`, `/travel`, `/city`, `/issueresolved`), instant page links (`INSTANT_COMMANDS`), and the actions this box's props switch on.
- `/event` takes `jan` (the next January, or the rest of this month if it is January), `past jan` (the last January to have started), `past` (the last 20 days), or text matched against title, city, venue and lineup — and month words can be followed by text (`/event dec fabric`). A plain search covers 20 days back to 60 ahead; a month loads that month's events.
- `/track` links to the track's album, since Navidrome's web UI has no track page; the link text is `Title – Artist`.

The menu stays shut when `@` or `/` is followed by a space, and closes when the search passes 15 characters (`MAX_SEARCH_CHARS`) with nothing matching — counting a name after `@`, the text after a command, or for `/event` the text after its month and `past` words — so the symbols can be used in ordinary sentences. Deleting back reopens it. Arrow keys move through the menu, Enter or Tab picks, Escape dismisses it; Ctrl/Cmd+Enter still sends. Results are written as Markdown links `[Name](url)`, which `parseMessageHTML` renders as hover cards where it knows the target.

**Actions** — only offered when the matching prop is supplied:

| Command | Effect |
|---------|--------|
| `/filmannounce1` | Announce the current month's film (`onFilmAnnounce(1)`) |
| `/filmannounce2` | Remind of the voting deadline (`onFilmAnnounce(2)`) |
| `/filmannounce3` | Announce next month's film (`onFilmAnnounce(3)`) |
| `/eventbot` | Post this week's calendar round-up (`onEventAnnounce`) |
| `/poll` | Open the poll composer (`onPollAttach`) |

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

- Commands every box offers are defined in `src/utils/tagCommands.ts`: add an instant link to `INSTANT_COMMANDS`, or a search to `SEARCH_COMMANDS` (with any aliases) and give it a `case` in `useTagging`'s menu.
- Board-only actions are `TagAction`s built from props at the top of `ForumMessageBox`.
