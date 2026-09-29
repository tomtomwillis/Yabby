# User Profile Page

**File:** `src/pages/UserProfile.tsx`
**Route:** `/user/:userId`

A public-facing profile page for any community member, accessible by their Firestore user ID.

## What It Shows

- **Bar** — "profile" label, a rule, "member since <month year>" (from `joinedAt`), and an `edit` link when viewing your own profile.
- **Avatar** — the user's chosen sticker image. Falls back to a coloured circle with the user's initial if no avatar is set or the image fails to load.
- **Bio** — free-text bio from `users/{userId}.bio`. Shows "no bio yet." if empty.
- **Facts list** — shown only if at least one is present:
  - **site** — personal site link (`SiteLink`)
  - **where** — optional flag emoji and location text
  - one row per connected social platform the member has set (`SocialHandle`, ordered by `SOCIAL_ORDER` from `src/utils/socials.ts`) — Instagram, Twitter/X, Signal, Discord, PlayStation, Bandcamp (artist/fan), SoundCloud, Mixcloud, Steam, or a radio show link
  - **calendar** — shown when the member has switched on either calendar-sharing setting (`ProfileCalendar`, see below)

## Calendar sharing

If the member has turned on "let others view my calendar" and/or "show my subscribe link" in the calendar page's settings panel (`CalendarMine`), a `calendar` fact row appears:

- **viewable** (`calendarPublic`) — a link to `/calendar?cal=:userId`, which filters the calendar to events they've ticked "interested?" on
- **subscribable** (`calendarFeedPublic`) — a "subscribe" button that fetches a signed `.ics` feed link on click (`getPublicFeedLink` in `src/utils/eventInterests.ts`) and offers Apple/Outlook (`webcal:`), Google Calendar, and copy-to-clipboard

See [Calendar Page](Pages-CalendarPage) and [ProfileCalendar](Components-ProfileCalendar).

## Data Fetching

Reads through the shared `getUserProfile` cache (`src/utils/userCache.ts`) rather than its own Firestore read — the message board, hover cards and this page all want the same document, so the first of them to ask pays for it. Also listens to `auth.onAuthStateChanged` to correctly detect whether the viewer owns the profile, since the auth state may not be ready immediately.

Avatar paths are normalised to `/Stickers/filename` regardless of how they were stored (with or without leading slash, with or without the `Stickers/` prefix).

## Components Used

- `Header` — displays the username as the page title
- `SiteLink` — the personal-site fact row
- `SocialHandle` — one per connected social platform
- `ProfileCalendar` — the calendar-sharing fact row

## Customising

- To add more profile fields, add them to `UserProfile` in `userCache.ts`, to the `users` write rules in `firestore.rules`, and to the facts `<dl>` here (and to `hasFacts` if the new field should count towards showing the list at all).
- Social platform definitions (label, pattern, URL builder) are in `src/utils/socials.ts` — add a platform there and to `isValidSocials` in `firestore.rules` rather than here.
- Profile field validation and write permissions are enforced by Firestore security rules on the `users` collection.
