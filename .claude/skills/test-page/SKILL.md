---
name: test-page
description: How the /test page works and how to run its suites. Use when changing anything that reads or writes Firestore, when editing firestore.rules, or when adding a feature with new collections.
---

# Test Page (`/test`)

Live end-to-end checks against a real Firestore, not unit tests. Files: `src/pages/Test.tsx` (page), `testSuites.ts` (suites), `testChecks.ts` (status row), `Test.css`.

The page has four parts:

1. **Status row** — runs on page load. Signed-in user, profile doc, Firestore read, message board query, lists composite index, Navidrome, backend API, and whether the sandbox rules are deployed. Answers "is the site working" without running anything.
2. **Test suites** — Message board, Lists, Stickers, Calendar, Calendar interests (full read/write/delete cycles) and Travel (read only). Calendar interests ends by fetching the member's real feed from the backend, so it fails until the backend is deployed with `CALENDAR_FEED_SECRET` set. Each suite also checks the rules *reject* bad writes: foreign `userId`, protected fields, invalid shapes.
3. **Sandbox message board** — a real `MessageBoard` on `testMessages` for clicking through the UI by hand.
4. **Component gallery** — carousels, buttons, text boxes, `UserMessage` variants.

## Sandboxing

Writes go to `testMessages`, `testLists`, `testStickers`, `testEvents`, `testEventCities`, `testEventInterests`. No other page reads these, so nothing a test creates appears on the live board, lists, sticker grid, calendar or map. Reads point at the live collections, since only real data proves the shapes and indexes are right.

Each pair (`messages`/`testMessages`, `lists`/`testLists`, `stickers`/`testStickers`, `events`/`testEvents`, `eventCities`/`testEventCities`, `eventInterests`/`testEventInterests`) **shares one rules block** via a wildcard match guarded by `isBoardCollection` / `isListCollection` / `isStickerCollection` / `isEventCollection` / `isEventCityCollection` / `isEventInterestCollection`. One deliberate difference: only `testEventInterests` may be deleted, since recreating a live one would revive a retired feed link. The sandbox therefore cannot drift from production, and a passing suite proves the real rules work.

**Every `allow` inside those wildcard blocks must start with its guard.** Without it the block grants access on every collection in the database. `allow ...: if false` lines are exempt (they grant nothing).

Test docs are tagged `[yabby-test]` and registered with `ctx.cleanup`, which the runner drains after each suite even when a test throws.

## Using it

After changing anything that reads or writes Firestore, run the affected suite and report whether it passed. Adding a feature with new collections means adding a suite, including the rejection cases. Claude runs the page through Playwright MCP signed in as the test user in `.env.local`.

Rules changes need `firebase deploy --only firestore:rules,firestore:indexes` before the suite reflects them. The status row flags when this has not been done.

Not covered: adding travel pins (backend has no sandbox), image uploads (backend cannot delete images), the map itself, media manager, beets, radio, film club, cinema.
