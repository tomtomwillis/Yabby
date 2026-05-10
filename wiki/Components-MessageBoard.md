# MessageBoard

**File:** `src/components/MessageBoard.tsx`

The community forum component. Handles fetching, posting, editing, deleting, replying to, and reacting to messages.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `enableReactions` | `boolean` | Enable heart reactions on messages and replies (default: `false`) |
| `enableReplies` | `boolean` | Enable threaded replies on messages (default: `false`) |
| `collectionName` | `string` | Firestore collection to read/write messages from (default: `"messages"`) |

## Features

- Paginated message feed, 20 per page, sorted by most recent activity (bump order)
- `@` tagging for artists/albums and `/` slash commands (via `ForumMessageBox`)
- Image attachments: paste or attach up to 5 MB images
- Threaded replies (lazy-loaded on first expand)
- Heart reactions with tooltip showing who reacted
  - Desktop: hover to see usernames
  - Mobile: long-press (500ms) to see usernames
- Optimistic UI for reactions and replies
- Edit and delete own messages and replies
- Admin can delete any message or reply
- Rate limiting: 10 messages per 5 minutes
- Admin-only film announcement: posts a formatted message as "Film Club Bot" (`avatar_filmbot.webp`) with the current month's film title, submitter, leaving date, trailer link, and a link to the Film Club page. Triggered via the `/filmannounce` slash command in `ForumMessageBox`

## Usage

```tsx
// Basic message board
<MessageBoard />

// With reactions and replies (as used on MessageBoardPage)
<MessageBoard enableReactions={true} enableReplies={true} />

// Film Club chat — separate Firestore collection
<MessageBoard enableReactions={true} enableReplies={true} collectionName="filmClubMessages" />
```

## Components Used

- `ForumMessageBox` — compose box with `@` tagging and `/` slash commands
- `UserMessages` — renders each individual message and its replies
