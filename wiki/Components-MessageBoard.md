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
- Admin-only film announcements (three variants) triggered via the `onFilmAnnounce` prop from `ForumMessageBox`. All post as "Film Club Bot" (`avatar_filmbot.webp`):
  - **Variant 1** — monthly announcement: film title, submitter, leaving date, optional description, trailer link, and vote link
  - **Variant 2** — voting reminder: days until voting closes, film title, links to the film club page and message board
  - **Variant 3** — winner reveal: next month's film name, days left to watch the current film, message board link

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
