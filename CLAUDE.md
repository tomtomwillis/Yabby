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

**Yabbyville** is a private music community SPA using Firebase Auth (email/password) and Firestore. Root url is yabbyville.xyz

### Gotchas

- Pre-commit hook flags shell command construction patterns — avoid even in comments
- More specific Vite proxy rules must come before general ones

### Key Data Flow Patterns

- **Sanitization**: All user-generated HTML goes through `src/utils/sanitise.ts` (DOMPurify). Usernames use `sanitizeText`. URLs validated with `validateUrl`.
- **User data caching**: Use shared cache (`userCache.ts`) — never create component-local caches

### Travel Feature

Leaflet map where users pin places with a comment and optional photos.

- `placeId` via `placeIdFor()` in `src/utils/geocode.ts` — never construct manually
- Two backends: photo uploads → `VITE_MEDIA_API_URL`, contributions CRUD → `VITE_TRAVEL_API_URL`
- `loadUserMemberships()` in `TravelPage.tsx` does N subcollection reads (one per place) — avoid adding more

### Firestore Read Budget

Free tier (50k reads/day) — minimising reads is critical:

- Denormalize counts on parent documents — never query subcollections just for counts
- Use `onSnapshot` only on-demand (e.g. expand/collapse); prefer `getDocs` for infrequently changing data
- Always clean up listeners on component teardown — store unsubscribe in `useRef`
- Use `docChanges()` to process only newly added documents in snapshots
- Optimistic UI updates for reactions — update local state immediately, write in background
- Use shared caches (`userCache.ts`, `useAdmin.ts`) — never create component-local duplicates

### Security Model

- All authorization enforced server-side via Firestore security rules, not client-side UI checks
- Client-side `useAdmin` hook is UI-only; always validate permissions on read/write operations
- After editing `firestore.rules`, deploy then run the affected `/test` suites — they assert both the allowed and the denied paths

### External Integrations

- **Navidrome**: Music library via Subsonic API
- **Copyparty**: File upload server
- **SLSKD**: Soulseek request integration
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
