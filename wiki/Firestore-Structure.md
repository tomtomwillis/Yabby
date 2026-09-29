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
| `socials` | map | Handles keyed by platform (`instagram`, `twitter`, `signal`, `discord`, `playstation`, `bandcampArtist`, `bandcampFan`, `soundcloud`, `mixcloud`, `steam`, `radio`) — see `src/utils/socials.ts` |
| `calendarPublic` | boolean | Others may filter the calendar to this member's "interested?" ticks |
| `calendarFeedPublic` | boolean | This member's `.ics` subscribe link is shown on their profile |

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

## `events/{eventId}` (plus `testEvents` for the `/test` sandbox)

Calendar events — see [Calendar Page](Pages-CalendarPage). Any signed-in member with a username may create one; only its author may edit it; the author or an admin may delete it.

| Field | Type | Notes |
|-------|------|-------|
| `title` | string | |
| `date` | string | `YYYY-MM-DD`, wall-clock date at the venue |
| `category` | string | `radio` \| `club` \| `gig` \| `release` \| `event` \| `other` |
| `time` / `endTime` | string | Optional, `HH:MM` |
| `timeZone` | string | Optional IANA zone; absent on all-day events and events saved before zones existed (treated as UK time) |
| `description` | string | Optional, may carry `@`-tags as `[text](url)` links |
| `location` / `city` | string | Optional |
| `lineup` | array | Optional, `{ name, artistId? }` per act |
| `cost` | string | Optional |
| `urls` | array of string | Optional, up to 5 |
| `imageId` | string | Optional, a media-API image id |
| `hosted` | boolean | Optional — the author says this is their own event; absent counts as `true` |
| `interestedBy` | array of string | uids who ticked "interested?" — public, like a post's likes |
| `interestCount` | number | Denormalised count of `interestedBy` |
| `userId` / `username` | string | Author; `username` must match the author's current profile username |
| `createdAt` / `updatedAt` | Timestamp | |

---

## `eventCities/{cityKey}`

Every city anyone has used on an event, for the calendar's city autocomplete. Document id is the lowercased city name. Added automatically the first time a member uses a new city.

| Field | Type |
|-------|------|
| `name` | string |
| `createdBy` | string |
| `createdAt` | Timestamp |

---

## `eventInterests/{userId}` (plus `testEventInterests`)

One private document per member: the events they've ticked "interested?" on. Nobody but the member (and the backend's calendar-feed Admin SDK read) may read their own document — this is what the member's own calendar and `.ics` feed are built from; the public count lives on the event itself (`interestedBy`/`interestCount` above).

| Field | Type | Notes |
|-------|------|-------|
| `eventIds` | array of string | Capped at 200 — oldest give way to new ticks past the cap |
| `feedVersion` | number | Signed into the member's `.ics` feed link; incrementing it retires every link issued before |

---

## `news/{newsId}`

Admin-only news posts. Same structure as `messages`. Only users in the `admins` collection can create or edit news.

---

## `admins/{userId}`

Stores the user IDs of admins. Managed via the Firebase Console only — the security rules prevent any client from writing to this collection.

To make someone an admin, add a document to this collection with their Firebase Auth UID as the document ID.
