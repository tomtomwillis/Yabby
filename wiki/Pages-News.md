# News Page

**File:** `src/pages/NewsPage.tsx`
**Route:** `/news`

A community news feed where admins post updates and announcements for all members.

News is a board like the message board and film club board — the same `MessageBoard` component on the `news` collection — with two things turned off. Only admins get the composer, and neither likes nor replies are shown here: news is read on this page and talked about on the message board, which is where a cross-posted news thread carries its reactions and replies.

## What It Shows

- A feed of news posts, newest activity first, paginated at 20 per page
- Each post displays the author's avatar, username (linked to their profile), poster stats, timestamp and message body
- An "edited" indicator when a post has been updated
- Admin-only: a compose box at the top of the feed and edit/delete controls on each post
- A tick box on the composer that also lists the post on the message board

## Components Used

- `Header` — page title ("News") and subtitle ("Updates & Announcements")
- `MessageBoard` — the board itself, with `enableReactions` and `enableReplies` off
- `BoardsRail` — links across to the other boards
- `Tips` — the note about cross-posting

## Access Control

Only users listed in the `admins` Firestore collection may post, edit or delete news items. The `useAdmin` hook controls whether the composer renders. All Firestore writes are protected by server-side security rules, which admit reactions and replies from any signed-in member but restrict the post itself to admins.

## Data

News posts are stored in the `news` Firestore collection. Each document has:

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Sanitised HTML message body |
| `userId` | `string` | Author's Firebase UID |
| `username` | `string` | Author's display name at time of posting |
| `avatar` | `string` | Author's avatar path at time of posting |
| `timestamp` | `Timestamp` | Server timestamp |
| `lastActivityAt` | `Timestamp` | Bumped when someone replies; what both this page and the cross-post query order by |
| `editedAt` | `Timestamp` (optional) | Set when the post is edited |
| `showOnMain` | `bool` (optional) | Set at post time when the author ticks the cross-post box. Read-only afterwards — the message board queries on it |
| `reactedBy` | `string[]` | UIDs that liked the post, from the message board |
| `reactionCount` | `number` | Denormalised count of the above |
| `replyCount` | `number` | Denormalised count of the `replies` subcollection |

Replies live in a `replies` subcollection, the same shape as every other board's.

## Customising

Post length is set by `postMaxWords` / `postMaxChars` on the `MessageBoard` (currently 1000 words, 5000 characters); the same word cap is applied to the edit box so a long post stays saveable. The rate limit is 10 posts per 5-minute window, set inside `MessageBoard`.
