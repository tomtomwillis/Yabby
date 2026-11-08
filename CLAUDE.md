# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Public & Open Source

Project is **public on GitHub**. All code, including security-sensitive logic, is publicly visible:
- No hardcoded secrets or credentials — use environment variables
- Avoid information disclosure in error messages
- Security through obscurity is not effective here

## Read-Only Shell Commands

Run without asking permission:

```
ls, find, cat, head, tail, grep, rg, wc, file, stat, du, df
git status, git log, git diff, git show, git branch, git remote
which, type, env, printenv, pwd, echo
npm ls, npm outdated
```

## Architecture

**Yabbyville** is a private music community SPA using Firebase Auth (email/password), Firestore, and an Express API (`backend_server/`, a git submodule) that holds a SQLite store the app is moving onto. Root url is yabbyville.xyz

### Gotchas

- Pre-commit hook flags shell command construction patterns — avoid even in comments
- More specific Vite proxy rules must come before general ones

### Key Data Flow Patterns

- **Sanitization**: All user-generated HTML goes through `src/utils/sanitise.ts` (DOMPurify). Usernames use `sanitizeText`. URLs validated with `validateUrl`.
- **User data caching**: Use shared cache (`userCache.ts`) — never create component-local caches

### Travel Feature

Leaflet map where users pin places with a comment and optional photos.

- `placeId` via `placeIdFor()` in `src/utils/geocode.ts` — never construct manually
- Photo uploads → `VITE_MEDIA_API_URL`; contribution writes → `VITE_TRAVEL_API_URL` (the server writes Firestore and mirrors to SQLite); reads → `src/api/areas/travel.ts`
- Places carry `contributorIds`, so the page and its filters need no subcollection reads; a place's contributions are read only when its bubble opens

### Firestore Read Budget

Free tier (50k reads/day) — minimising reads is critical:

- Denormalize counts on parent documents — never query subcollections just for counts
- Use `onSnapshot` only on-demand (e.g. expand/collapse); prefer `getDocs` for infrequently changing data
- Always clean up listeners on component teardown — store unsubscribe in `useRef`
- Use `docChanges()` to process only newly added documents in snapshots
- Optimistic UI updates for reactions — update local state immediately, write in background
- Use shared caches (`userCache.ts`, `useAdmin.ts`) — never create component-local duplicates

### Data Migration (Firestore → SQLite, in progress)

Areas move off Firestore one at a time. **Travel and stickers read from SQLite** (since 2026-11-08), through `src/api/areas/`; sticker writes go to the API, which writes SQLite first and copies the change to Firestore. Everything else still reads Firestore, and every Firestore write is also reported to a SQLite shadow (`POST /api/data/shadow`).

- **Moved areas:** components call the area module (`src/api/areas/<area>.ts`), never Firestore for that collection. Each read goes through `readArea`, which follows the flag (`GET /api/data/source`, from `/yabbyville/data/data-source.json` on the host) and falls back to Firestore on a network error, timeout or 5xx. Writes go through `writeArea` and never fall back. To move another area, follow `backend_server/data/AREA_MOVE.md`.

- **Every browser write to Firestore goes through `src/api/shadow.ts`.** Use `addDocShadowed`, `setDocShadowed`, `updateDocShadowed`, `deleteDocShadowed`, `writeBatchShadowed`, and the markers `SERVER_TIME`, `incrementBy`, `arrayUnionOf`, `arrayRemoveOf` and `DELETE_FIELD` (top level only) instead of the Firestore sentinels. ESLint rejects the raw write functions elsewhere. A transaction must call `reportWrite` after it commits (see `FilmClub.tsx`).
- Backend-side Admin SDK writes must call `data/mirror.js`; see `backend_server/CLAUDE.md`.
- **Keep the SQLite side in lockstep with Firestore.** Any new write path, collection or profile field must be dual-written, and any `firestore.rules` change must be ported to `backend_server/data/policy.js` in the same change. A field added only to the rules makes the shadow reject writes the app allows. In a moved area the API endpoint is the enforcer instead: a rule change there must be made in its route (`backend_server/routes/areas/`) too.
- `npm run test:policy` checks the backend's port of the rules (`backend_server/data/policy.js`) against the real `firestore.rules` in the Firestore emulator, over every valid write it lists and many mutations of each. Run it after changing either. It needs Java and the backend's dependencies (`cd backend_server && npm ci`), and it never touches the real Firestore.
- Current phase, next steps and history: `/yabbyville/backend/_backend_plan/STATUS.md` **on the host** (not in git; the Mac's `_backend_plan/` copy is older). Design: `DATA_MIGRATION_PLAN.md` beside it. Host operations: `backend_server/data/RUNBOOK.md`.

### Security Model

- All authorization enforced server-side, never by client-side UI checks: by Firestore security rules, and for a moved area's writes by its API endpoint (`backend_server/routes/areas/`), which ports those rules
- Client-side `useAdmin` hook is UI-only; always validate permissions on read/write operations
- After editing `firestore.rules`, deploy then run the affected `/test` suites — they assert both the allowed and the denied paths — and run `npm run test:policy`, which fails until `policy.js` matches

### External Integrations

- **Navidrome**: Music library via Subsonic API
- **SLSKD**: Soulseek requests, an external link (`VITE_SLSK_REQUEST_URL`); downloads land where beets imports them
- **Beets**: Music library management via WebSocket terminal on host
- **Umami**: Analytics (page views, custom events via `window.umami?.track()`) — suggest adding tracking when implementing features that don't have it

All external service credentials are environment variables only.

## Code Style

- Functional components only (no class components)
- CSS files co-located with their component
- Prefer named exports for utilities, default exports for pages/components
- Use existing sanitisation utils for any user-generated content — never bypass DOMPurify
- Comments only when the WHY is non-obvious — never reference removed code or ongoing changes

## Working With Me and the codebase

- Be honest when you don't know something or aren't confident in an answer — say so directly rather than guessing.
- If a request doesn't seem possible or practical, say that clearly and suggest viable alternatives instead of attempting something unlikely to work.
- When uncertain about the right approach, present options with trade-offs rather than picking one silently.
- Always be extremely concise. No pleasantries, no bullet points unless I ask, minimal explanation. Get to the point in 2-3 sentences max unless the question clearly needs more depth. 
- Have a cheerful/polite disposition, assume the best of me, but don't be sycophantic. Call out anything I get incorrect. Try to clarify any code needs during initial requests to reduce scope. 
- Before executing a request, briefly consider whether the premise is sound, let me know, if not, proceed as usual.

### Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

### Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
## Test Page (`/test`)

After changing anything that reads or writes Firestore — including `firestore.rules` — run the affected `/test` suite and report whether it passed. Adding a feature with new collections means adding a suite, including the rejection cases. See the `test-page` skill for how the page is structured, how sandboxing works, and what it does not cover.
