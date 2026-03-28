# Firestore Structure

The app uses these Firestore collections. They are created automatically the first time a user writes to them — you do not need to create them manually.

Security rules are in `firestore.rules`. Deploy them to your Firebase project:

```bash
firebase deploy --only firestore:rules
```

---

## `users/{userId}`

User profiles.

| Field | Type | Notes |
|-------|------|-------|
| `username` | string | 2–20 chars, alphanumeric + spaces/hyphens/underscores |
| `avatar` | string | Path to sticker image |
| `shape` | string | Avatar shape name |
| `color` | string | Avatar colour name |
| `bio` | string | Up to 500 chars, sanitised HTML |
| `locationFlag` | string | Flag emoji |
| `locationText` | string | Up to 100 chars |
| `nekoEnabled` | boolean | Whether the Oneko cat is active |

---

## `messages/{messageId}`

Message board posts.

| Field | Type |
|-------|------|
| `text` | string (HTML, sanitised) |
| `userId` | string |
| `username` | string |
| `avatar` | string |
| `timestamp` | Timestamp |
| `lastActivityAt` | Timestamp |

**Subcollections:**
- `reactions/{userId}` — heart reactions (one per user)
- `replies/{replyId}` — threaded replies (same shape as messages, plus their own `reactions` subcollection)

---

## `stickers/{stickerId}`

Stickers placed on album covers.

| Field | Type | Notes |
|-------|------|-------|
| `userId` | string | |
| `albumId` | string | Navidrome album ID |
| `text` | string | Message with the sticker |
| `position` | `{x: number, y: number}` | Normalised 0–1 coordinates |
| `sticker` | string | Avatar image path or emoji |
| `timestamp` | Timestamp | |
| `favoriteTrackId` | string | Optional |
| `favoriteTrackTitle` | string | Optional |

---

## `lists/{listId}`

User-created album lists.

| Field | Type |
|-------|------|
| `title` | string |
| `userId` | string |
| `username` | string |
| `timestamp` | Timestamp |
| `itemCount` | number |
| `isPublic` | boolean |
| `isCollaborative` | boolean |

**Subcollection:** `items/{itemId}`

| Field | Type | Notes |
|-------|------|-------|
| `type` | `'album'` or `'custom'` | |
| `order` | number | Display order |
| `albumId` | string | If type is `album` |
| `albumTitle` | string | If type is `album` |
| `albumArtist` | string | If type is `album` |
| `albumCover` | string | If type is `album` |
| `title` | string | If type is `custom` |
| `imageUrl` | string | If type is `custom` |
| `userText` | string | User's note on the item |

---

## `news/{newsId}`

Admin-only news posts. Same structure as `messages`. Only users in the `admins` collection can create or edit news.

---

## `admins/{userId}`

Stores the user IDs of admins. Managed via the Firebase Console only — the security rules prevent any client from writing to this collection.

To make someone an admin, add a document to this collection with their Firebase Auth UID as the document ID.
