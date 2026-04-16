# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Root

The project root is `/Users/hamish/Documents/Yabbyville/new github repo/Yabby`. All commands should be run from this directory — do not `cd` or ask permission to navigate here.

## ⚠️ Public & Open Source

This project is **public on GitHub**. All code, including security-sensitive logic, is publicly visible. When reviewing code and implementing features:
- Avoid hardcoding secrets or credentials (use environment variables)
- Be mindful of information disclosure in error messages
- Remember that security through obscurity is not effective here
- Document security assumptions clearly

## Read-Only Shell Commands

The following non-destructive commands may be run without asking for permission:

```
ls, find, cat, head, tail, grep, rg, wc, file, stat, du, df
git status, git log, git diff, git show, git branch, git remote
which, type, env, printenv, pwd, echo
npm ls, npm outdated
```

## Build & Development Commands

```bash
npm run dev        # Start Vite dev server with PWA enabled
npm run build      # TypeScript check + Vite production build
npm run lint       # ESLint
npm run preview    # Preview production build locally
```

Verify changes with `npm run build` to catch TypeScript errors.

## Architecture

**Yabbyville** is a private music community SPA using Firebase Auth (email/password) and Firestore.

### Directory Structure

```
src/
├── components/       # Reusable UI components
│   ├── media/        # Media manager tools (BeetsTerminal, CoverArtTool, etc.)
│   └── basic/        # Low-level primitives (Button, Carousel, Star, etc.)
├── pages/            # Route-level page components
├── utils/            # Hooks and helpers (sanitise, useAdmin, userCache, etc.)
├── types/            # TypeScript ambient declarations
└── assets/           # Static assets (fonts, images)
```

### Routing & Auth

- React Router v7 with `PrivateRoute` wrapper — all routes except `/login` require authentication
- All authorization logic is enforced server-side via Firestore security rules, not client-side

### Media Manager

- `MediaManager.tsx` is a tabbed container — tools live in `src/components/media/`
- Cover art tool extracted to `CoverArtTool.tsx`, beets import in `BeetsTerminal.tsx`
- `useMediaManager` hook gates UI access; server enforces actual authorization
- Utilises node express server on the backend

### Gotchas

- In `vite.config.ts`, more specific proxy rules must come before general ones (e.g., `/api/media/beets/terminal` before `/api/media`)
- `Header` component's `subtitle` prop is required (`string`, not `string | undefined`) — use nullish coalescing when the value might be undefined
- A pre-commit security hook flags mentions of shell-based command construction patterns even in comments/docs — rephrase to avoid triggering it

### Key Data Flow Patterns

- **Sanitization**: All user-generated HTML goes through `src/utils/sanitise.ts` (DOMPurify). Usernames use `sanitizeText`. URLs validated with `validateUrl`.
- **User data caching**: `src/utils/userCache.ts` is the single shared cache for user lookups (30-min TTL). Always import `getUserData` from there — never create local caches

### Firestore Collections & Security

Key collections: `users`, `messages` (with `reactions`/`replies` subcollections), `news` (with `reactions` subcollection), `stickers`, `lists` (with `items` subcollection), and `admins` (write-protected).

### Firestore Read Budget

We are on the Firestore free tier (50k reads/day). Minimising reads is critical:

- **Never use `onSnapshot` for subcollections per-item** (e.g. reactions per message). This creates N listeners that each re-read all docs on any change. Use denormalized counts on the parent document instead, and fetch subcollection data on-demand.
- **Denormalized counts**: `messages` documents carry `reactionCount` and `replyCount` fields. Reply documents carry `reactionCount`. Update these via `increment()` when adding/removing reactions or replies. Display counts from the parent document — don't query subcollections just for counts.
- **On-demand loading**: Reply listeners (`onSnapshot`) are only created when a user expands a reply thread, and torn down when collapsed. Reaction details are fetched one-time via `getDoc` (current user's status) — not via persistent listeners.
- **Always clean up listeners**: Every `onSnapshot` must have its unsubscribe stored in a `useRef` and called on cleanup. Never create listeners inside other listener callbacks without tracking them.
- **Use shared caches**: `userCache.ts` (30-min TTL) for user data, `useAdmin.ts` (30-min module-level cache) for admin status. Never create component-local duplicates of these caches.
- **Prefer `getDocs` over `onSnapshot`** for data that changes infrequently (e.g. news reactions, sticker data, list metadata).
- **Use `docChanges()`** to identify newly added documents in a snapshot and only perform per-document reads (like reaction status checks) for those, not for all documents on every snapshot fire.
- **Optimistic UI updates**: When toggling reactions, update local state immediately and write to Firestore in the background. Don't wait for a listener to reflect the change.

### Security Model

- All authorization enforced server-side via Firestore security rules, not client-side UI checks
- Client-side `useAdmin` hook is UI-only; always validate permissions on read/write operations

### External Integrations

- **Navidrome**: Music library via Subsonic API
- **Copyparty**: File upload server
- **SLSK**: Soulseek request integration
- **Beets**: Music library management via WebSocket terminal (`/opt/beetsenv/bin/beet` on host)

### Backend (Express API)

- Dockerised Express.js server at `/yabbyville/docker/coverartAPI/`, port 3200
- Built manually via Portainer (no CI/CD pipeline)
- Beets runs on the **host** at `/opt/beetsenv/bin/beet` — Docker container needs volume mounts for `/opt/beetsenv`, `/media/IncomingMusic`, `/media/UserUploads`, and `/etc/beets/` (config + library.db)
- Caddy reverse proxy handles WebSocket upgrades automatically — no special config needed
- Beets import terminal uses WebSocket at `/api/media/beets/terminal` with single-instance session lock (one user at a time, 10-min idle timeout)
- Local details on the Express server are in the _backend_plan folder

All external service credentials are environment variables only.

## Environment Variables

Copy `example.env` to `.env` and fill in values. All vars are prefixed `VITE_` (exposed to client via Vite).
Key groups: Firebase config, Navidrome/Subsonic API, Copyparty URLs, SLSK request URL, Media API (`VITE_MEDIA_API_URL`, `VITE_MEDIA_WS_URL`).

## Code Style

- Functional components only (no class components)
- CSS files co-located with their component (e.g. `RadioPlayer.tsx` + `RadioPlayer.css`)
- Prefer named exports for utilities, default exports for pages/components
- Use existing sanitisation utils for any user-generated content — never bypass DOMPurify

## Working With Me

- Be honest when you don't know something or aren't confident in an answer — say so directly rather than guessing.
- If a request doesn't seem possible or practical, say that clearly and suggest viable alternatives instead of attempting something unlikely to work.
- When uncertain about the right approach, present options with trade-offs rather than picking one silently.
