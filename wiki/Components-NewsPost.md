# NewsPost

**File:** `src/components/NewsPost.tsx`

Renders a single news post with the author's avatar, username, timestamp, and message body. Admins can edit and delete posts they authored.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `username` | `string` | Author's display name |
| `message` | `string` | Sanitized HTML message body |
| `timestamp` | `string` | Pre-formatted timestamp string |
| `userSticker` | `string` (optional) | Path to the author's avatar image |
| `userId` | `string` (optional) | Author's Firebase UID — used to link username to their profile |
| `currentUserId` | `string` (optional) | Logged-in user's UID — used to determine edit/delete permission |
| `isAdmin` | `boolean` (optional) | Whether the current user is an admin |
| `onEdit` | `(newText: string) => void` (optional) | Called with sanitized edited text |
| `onDelete` | `() => void` (optional) | Called after deletion is confirmed |
| `edited` | `boolean` (optional) | Shows an "(edited)" indicator when `true` |
| `truncate` | `boolean` (optional) | Truncate long posts with a "Show More" button (default: `false`) |
| `truncateWords` | `number` (optional) | Word count threshold for truncation (default: 25) |

## Usage

```tsx
<NewsPost
  username={item.username}
  message={item.text}
  timestamp={formatTimestamp(item.timestamp)}
  userSticker={item.avatar}
  userId={item.userId}
  currentUserId={auth.currentUser?.uid}
  isAdmin={isAdmin}
  onEdit={(text) => handleEditNews(item.id, text)}
  onDelete={() => handleDeleteNews(item.id)}
  edited={!!item.editedAt}
/>
```

## Behaviour

- Edit and delete buttons are shown only when `isAdmin` is true **and** the current user is the post's author (`userId === currentUserId`).
- Clicking edit opens an inline `ForumMessageBox` pre-filled with the current message text. The `onEdit` callback receives sanitized HTML.
- Clicking delete shows a confirmation dialog before calling `onDelete`.
- News posts do not have heart reactions — see `UserMessages` for the message board variant.

## Customising

Used on [News page](Pages-News) and in `RecentNews` (homepage snippet). The `truncate` and `truncateWords` props are used by `RecentNews` to show a short preview with a "Show More" expand button.
