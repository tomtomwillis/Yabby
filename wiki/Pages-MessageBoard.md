# Message Board Page

**File:** `src/pages/MessageBoardPage.tsx`
**Route:** `/messageboard`

A community forum where users can post messages, reply to each other, and react with hearts.

## Features

- Messages with `@` tagging for artists/albums (links to Navidrome) and `/` slash commands for linking to lists, playlists, travel recs, cities, and community pages
- Image attachments (paste or file select, max 5 MB)
- Threaded replies on each message
- Heart reactions (click to react, long-press on mobile / hover on desktop to see who reacted)
- Message editing and deletion (own messages, or any message for admins)
- Client-side rate limiting: 10 messages per 5 minutes
- Pagination for older messages (20 per page, bump order)

## Components Used

- `MessageBoard` — the main feature component that handles all logic
- `ForumMessageBox` — compose box with `@` tagging and `/` slash commands
- `UserMessages` — renders individual messages
- `Tips` — contextual tip bar (randomly shows the slash-command tip or the reaction tip)

## Customising

- To disable reactions: `<MessageBoard enableReactions={false} />`
- To disable replies: `<MessageBoard enableReplies={false} />`
- To change rate limits, edit the `useRateLimit` parameters in `MessageBoard.tsx`
- Message validation rules are in `firestore.rules` under the `messages` collection
