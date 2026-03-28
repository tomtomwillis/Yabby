# Message Board Page

**File:** `src/pages/MessageBoardPage.tsx`
**Route:** `/messageboard`

A community forum where users can post messages, reply to each other, and react with hearts.

## Features

- Rich text messages with `@` tagging for artists/albums (links to Navidrome)
- Threaded replies on each message
- Heart reactions (click to react, long-press on mobile to see who reacted)
- Message editing and deletion (own messages, or any message for admins)
- Client-side rate limiting: 10 messages per 5 minutes
- Pagination for older messages

## Components Used

- `MessageBoard` - the main feature component that handles all logic
- `ForumMessageBox` - the rich text editor with `@` tagging
- `UserMessages` - renders individual messages

## Customising

- To disable reactions: `<MessageBoard enableReactions={false} />`
- To disable replies: `<MessageBoard enableReplies={false} />`
- To change rate limits, edit the `useRateLimit` parameters in `MessageBoard.tsx`
- Message validation rules are in `firestore.rules` under the `messages` collection
