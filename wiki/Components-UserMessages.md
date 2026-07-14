# UserMessages

**File:** `src/components/basic/UserMessages.tsx`

Displays a single user message with avatar, username, timestamp, and content. Supports threaded replies, heart reactions, image attachments, film poster display, and inline editing.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `username` | `string` | The author's display name |
| `message` | `string` | HTML or plain text message content (sanitised before rendering) |
| `timestamp` | `string` | Formatted timestamp string |
| `userSticker` | `string` | Avatar image filename (`.webp`/`.png`/`.jpg`) or emoji |
| `onClose` | `() => void` | Called when the close button is clicked |
| `hideCloseButton` | `boolean` | Hides the close button when `true` |
| `userId` | `string` | The author's Firebase UID — used to link to their profile |
| `currentUserId` | `string` | The logged-in user's UID — determines edit/delete ownership |
| `isAdmin` | `boolean` | When `true`, the current user can delete any message |
| `onEdit` | `(newText: string) => void` | Called with sanitised text when the user saves an edit |
| `onDelete` | `() => void` | Called when the user confirms deletion |
| `edited` | `boolean` | Shows an "(edited)" indicator next to the timestamp |
| `imageId` | `string` | ID of an attached image; resolved to `VITE_MEDIA_API_URL/mb-images/{id}.webp` |
| `posterUrl` | `string` | Direct URL to a film poster image (used by Film Club bot announcements) |
| `reactions` | `Reaction[]` | Array of reactor objects for the tooltip |
| `reactionCount` | `number` | Displayed reaction count |
| `currentUserReacted` | `boolean` | Whether the logged-in user has reacted |
| `onToggleReaction` | `() => void` | Called when the heart button is clicked |
| `onReactionHover` | `() => void` | Called on hover/long-press to lazy-fetch reactor list |
| `replies` | `Reply[]` | Loaded reply objects (shown when expanded) |
| `replyCount` | `number` | Total reply count (shown on the collapse/expand indicator) |
| `onReply` | `(text: string, image?: File \| null) => void` | Called when a reply is submitted |
| `onToggleReplies` | `() => void` | Called when the expand/collapse indicator is clicked |
| `repliesExpanded` | `boolean` | Controls whether the replies section is visible |
| `onEditReply` | `(replyId: string, newText: string) => void` | Called when a reply is edited |
| `onDeleteReply` | `(replyId: string) => void` | Called when a reply is deleted |
| `onToggleReplyReaction` | `(replyId: string) => void` | Called when a reply's heart is clicked |
| `onReplyReactionHover` | `(replyId: string) => void` | Called on reply heart hover to lazy-fetch reactor list |
| `replyingToUsername` | `string` | Username shown in the reply input header |
| `enableReplies` | `boolean` | When `false`, hides all reply UI |
| `isReply` | `boolean` | Marks this instance as a nested reply (suppresses reply/close controls) |
| `pollQuestion` / `pollOptions` / `pollMultiple` / `pollVotes` / `pollVoterNames` | various | Poll data rendered via `PollBlock` when `pollQuestion` is set |
| `onTogglePollVote` | `(optionIndex: number) => void` | Called when a poll option is clicked |
| `onPollVoterHover` | `(optionIndex: number) => void` | Called on option hover to lazy-fetch voter names |
| `status` | `'inprogress' \| 'complete'` | Issue status — decides the status toggle icon (check vs undo) |
| `onToggleStatus` | `() => void` | When provided (admins on the Issues board), shows a status toggle button next to delete |

## Usage

```tsx
<UserMessage
  username="Jane"
  message="Great album!"
  timestamp="21 Sep 2025, 11:00"
  userSticker="avatar_star_blue.webp"
  hideCloseButton={true}
  userId="uid123"
  currentUserId={auth.currentUser?.uid}
  isAdmin={isAdmin}
  onEdit={(text) => handleEdit(text)}
  onDelete={() => handleDelete()}
  edited={false}
  enableReplies={true}
/>
```

## Message Rendering

The `parseMessageHTML` helper (exported from this file) processes message content in order:

1. Sanitises HTML via `sanitizeHtml` (DOMPurify)
2. Converts `\n` newlines to `<br>` elements
3. Converts Markdown-style `[text](url)` links via `parseMarkdownLinks`
4. Auto-detects bare URLs and wraps them in `<a>` tags via `linkifyText`
5. Renders through `html-react-parser` with a safe allowlist — only `<a>` (validated `http`/`https` URLs) and `<br>` pass through; all other tags are stripped to their text content

## Customising

- To change avatar fallback behaviour, edit `renderUserSticker` inside the component.
- Film poster images are validated with the same URL check as link hrefs — only `http`/`https` URLs render.
- The long-press duration for the reaction tooltip on mobile is 500 ms; adjust `setTimeout` in `handleTouchStart`.
