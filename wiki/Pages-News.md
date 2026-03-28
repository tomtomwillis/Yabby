# News Page

**File:** `src/pages/NewsPage.tsx`
**Route:** `/news`

A community news feed where admins can post updates and announcements for all members.

## What It Shows

- A chronological feed of news posts, newest first, paginated at 5 per page
- Each post displays the author's avatar, username (linked to their profile), timestamp, and message body
- Heart reaction button with a tooltip listing who reacted
- An "edited" indicator when a post has been updated
- Admin-only: a compose box at the top of the feed and edit/delete controls on each post

## Components Used

- `Header` — page title ("News") and subtitle ("Updates & Announcements")
- `NewsPost` — renders each individual news item
- `ForumMessageBox` — compose box shown only to admins
- `Button` — "Show More" pagination button

## Access Control

Only users listed in the `admins` Firestore collection may post, edit, or delete news items. The `useAdmin` hook controls visibility of admin UI. All Firestore writes are still protected by server-side security rules.

## Data

News posts are stored in the `news` Firestore collection. Each document has:

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Sanitised HTML message body |
| `userId` | `string` | Author's Firebase UID |
| `username` | `string` | Author's display name at time of posting |
| `avatar` | `string` | Author's avatar path at time of posting |
| `timestamp` | `Timestamp` | Server timestamp |
| `editedAt` | `Timestamp` (optional) | Set when the post is edited |

Reactions are stored in a `reactions` subcollection under each news document (one document per user, keyed by UID).

## Customising

Change `NEWS_PER_PAGE` (currently 5) to load more posts at once. The rate limit for posting is set in the `useRateLimit` call: currently 10 posts per 5-minute window.
