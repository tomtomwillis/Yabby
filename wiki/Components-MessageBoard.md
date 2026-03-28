# MessageBoard

**File:** `src/components/MessageBoard.tsx`

The community forum component. Handles fetching, posting, editing, deleting, replying to, and reacting to messages.

## Props

- `enableReactions` - enable heart reactions (default: `false`)
- `enableReplies` - enable threaded replies

## Features

- Real-time Firestore updates
- Threaded replies (click a message to expand replies)
- Heart reactions with tooltip showing who reacted
  - Desktop: hover to see usernames
  - Mobile: long-press (500ms) to see usernames
- Edit and delete own messages
- Admin can delete any message
- Rate limiting: 10 messages per 5 minutes
- Pagination for older messages

## Usage

```tsx
// Basic message board
<MessageBoard />

// With reactions and replies
<MessageBoard enableReactions={true} enableReplies={true} />
```

## Components Used

- `ForumMessageBox` - for composing messages
- `UserMessages` - for displaying each message
