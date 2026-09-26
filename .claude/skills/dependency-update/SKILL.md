---
name: dependency-update
description: Audit and update npm dependencies for the site and backend. Applies safe in-range updates and security fixes, verifies nothing broke, and flags upgrades that need code changes with an offer to plan them. Use when asked to update packages, check for vulnerabilities or outdated dependencies, or do routine maintenance.
---

# Dependency update

Goal: stay patched without breaking the site. Apply what is safe, verify it against the features that use it, and surface the rest as a plain-English decision, with an upgrade plan on request.

The user is not a dependency expert. Explain each advisory as what it means for Yabbyville ("someone could crash photo uploads"), not in CVE terms. Keep reports short.

Run monthly, and straight away when a security-critical package (below) has an advisory.

## Scope

| Project | Path | Repo | Ships to |
|---|---|---|---|
| Site | `/` | public | Browser (Vite build, PWA) |
| Backend | `backend_server/` (submodule) | private | Docker on the home server |

Also check, but do not change without asking: the backend `Dockerfile` (base images, and whether it installs from the lockfile), the unpinned pip packages there (beets, mutagen, discogs-client, beetcamp), and the Node version against its end-of-life date.

Skip `.design-sync/` and `.ds-sync/`: untracked local tooling.

## What each package touches

Use this table to decide how much care an update needs and how to verify it. Keep it current: when a dependency is added or removed, update this table.

**Security-critical**: an advisory on any of these is urgent whatever its severity label, because they sit on untrusted input or auth.

| Package | Used for | Verify |
|---|---|---|
| dompurify | All user HTML (`utils/sanitise.ts`) | `/test` "strips dangerous HTML" check |
| marked, html-react-parser | Wiki markdown, message rendering | `/wiki`, `/messageboard` render |
| firebase | Auth and every Firestore read/write | Login, `/test` all suites, `test:policy` |
| multer, sharp (backend) | Uploads and image processing for music, message images, travel photos | backend `npm test`, native load check |
| express, cookie-parser, helmet, cors, express-rate-limit (backend) | Every API request | backend `npm test`, `/test` status row "Backend API" |
| jsonwebtoken (backend) | Cinema stream tokens | backend `npm test` |

**Everything else**

| Package | Used for | Verify |
|---|---|---|
| react, react-dom, react-router-dom | Whole app | smoke test |
| react-firebase-hooks | Auth state, `PrivateRoute` | Login redirect works |
| leaflet, react-leaflet | `/travel` map, home travel widget | Map shows tiles and pins |
| embla-carousel-* | Home carousels | Home and `/test` component gallery |
| hls.js | `/cinema` live stream | **Manual**: Playwright's Chromium lacks H.264/AAC |
| butterchurn, butterchurn-presets | Audio visualiser (`useAudioEngine`) | **Manual**: needs MP3 playback |
| js-md5 | Navidrome auth token | `/test` status row "Navidrome" |
| @tdanks2000/tmdb-wrapper | Film club search box | **Manual**: search a film on `/film-club-submit` |
| @xterm/* | Beets terminal in media manager | **Manual**: admin only, and the test account is not admin |
| react-icons, @fortawesome/* | Icons | smoke test |
| vite-plugin-pwa | Service worker | Build prints "PWA … files generated" |
| better-sqlite3 (backend) | SQLite shadow DB and backups | backend `npm test` (covers `data/`) |
| node-pty, ws (backend) | Beets terminal | native load check; manual as above |
| firebase-admin | Backend auth and Admin writes; root `test:policy` and local admin scripts | backend `npm test`, `test:policy` |
| @firebase/rules-unit-testing | `test:policy` | `test:policy` |

## 0. Preconditions

Run `git status` in both repos. If `package.json` or `package-lock.json` already has changes, stop and ask. Other uncommitted work is fine; leave it unstaged.

Read `LEDGER.md` in this folder (gitignored, local only) for accepted risks, held-back packages and pending upgrades from earlier runs. If it is missing, create it with those sections.

## 1. Baseline

Capture results before touching anything, so failures can be attributed:

- `npm run build` (must pass)
- `npx eslint . -f json > "$TEMP/claude/lint-before.json"`. Lint already has existing errors, so compare by the set of `file:line:rule` entries, not the exit code.
- `cd backend_server && npm test`

If the baseline build or backend tests fail, stop and report. Do not update on a broken base.

## 2. Survey

In each project run `npm outdated` and summarise audit advisories:

```
npm audit --json | node -e "const j=JSON.parse(require('fs').readFileSync(0));console.log(j.metadata.vulnerabilities);for(const [k,v] of Object.entries(j.vulnerabilities)){for(const x of v.via)if(typeof x==='object')console.log(k,'|',x.severity,'|',x.title,'|',x.range,'|',x.url);console.log('  fix:',JSON.stringify(v.fixAvailable))}"
```

For each advisory:
- Find the dependency path with `npm ls <pkg>`.
- Judge **reachability**. Is the code shipped to browsers, running in the backend on user input, or only used in build or dev tooling? When it is borderline, read the advisory's trigger condition and grep `node_modules` for how the dependency is actually called. A high in dev tooling matters less than a moderate in the upload path.
- Check the ledger. If it is already an accepted risk, say so in one line and move on.

Also check:
- Node end of life: WebFetch `https://endoflife.date/api/nodejs.json` and compare against the Dockerfile's `node:` tag and the local `node -v`. Flag anything within 6 months of end of life.
- Deprecated or obsolete packages, such as `@types/*` for libraries that now ship their own types.
- Open Dependabot PRs, if any: `gh pr list --search "author:app/dependabot"`.

## 3. Triage

Sort every finding into one of three buckets, and use these words in the report:

| Bucket | Meaning | Action |
|---|---|---|
| **Act now** | Security fix available in range, or any advisory on a security-critical package that is reachable | Apply this run |
| **Soon** | Advisory that needs a major bump or code change; a Node or base image within 6 months of end of life | Explain the impact; offer an upgrade plan |
| **Whenever** | New majors with no security driver; unreachable advisories | One line each; accept into the ledger with a reason |

Everything patch or minor within the existing ranges is applied as well, even with no advisory. Small regular steps are easier than big jumps. TypeScript minors (pinned `~`) can add type errors, so try them; the build shows the result right away.

## 4. Apply

In each project run `npm update`, then `npm audit fix`.

For a security fix, also raise the `package.json` floor to the patched version, for example `npm pkg set dependencies.multer="^2.4.0"`, then `npm install`. If the backend Dockerfile still runs `npm install` without copying the lockfile, the floor is the only thing that guarantees production gets the patched version.

Never:
- `npm audit fix --force`
- delete `package-lock.json` or `node_modules` to "fix" a resolution
- `--legacy-peer-deps` or `overrides` without flagging it to the user as a decision
- bump a major version as part of a routine run

## 5. Verify

Only verify what changed, using the table above, but always do the build and the smoke test.

Site:
1. `npm run build` passes, and the PWA step still generates `sw.js`.
2. Lint set diff against the baseline shows no new entries.
3. `npm run test:policy` passes, if any Firebase package changed. It takes about 1 minute and needs Java. Run it in the background while doing step 4.
4. Smoke test the **production build**:
   - Run `npx vite preview --port 4179 --strictPort` in the background.
   - Use Playwright to log in as the test user from `.env.local`.
   - Visit `/`, `/messageboard`, `/travel`, plus the pages for any changed package in the table. Check the console for errors.
   - Go to `/test`, check that the status row is all OK, then click **Run all suites** once. Every suite must pass (see the `test-page` skill). The run costs Firestore reads, so do not repeat it without a reason.
   - `/api/*` proxies to the **live** backend, so errors from it reflect production, not this change. Third-party errors, such as open-meteo weather, are not regressions either.
   - If Playwright says "Browser is already in use", stop only the `chrome.exe` processes whose command line contains `mcp-chrome-`. Never stop the user's own Chrome.
5. Stop the preview server. Leave the user's Vite dev server running.

Backend:
1. `npm test` passes.
2. Native modules load: `node -e "require('sharp');require('better-sqlite3');require('node-pty');require('multer');require('express');require('ws')"`.
3. `node --check server.js`.

If something fails, bisect by reverting single packages (`npm install <pkg>@<old>`), hold that package back, and record it in the ledger with the reason.

## 6. Report

Short, plain English, in this order:
1. **Done**: what was updated, and which advisories that closed, with what each one meant for the site.
2. **Checked**: verification results with counts.
3. **You check**: the manual items for packages that changed ("hls.js updated: open `/cinema` in your browser during a stream"). Leave this out if none apply.
4. **Soon**: each item with impact, rough effort and an offer to plan it.
5. **Whenever**: one line each.
6. **Deploy**: whether a backend fix is waiting on a deploy.

Then update `LEDGER.md`: add a dated run entry and refresh the accepted-risk, held-back and pending-upgrade lists.

## 7. Upgrade plans (on request)

For each package:
1. Read the official migration guide or changelog for every major between the current and target versions (WebFetch).
2. Grep for every usage site of the changed APIs, and list them with file links. Start from the table above.
3. Write the plan: ordered steps, code changes per file, which checks from the table prove it works, and a rollback path (revert `package.json` and the lockfile).
4. Use plan mode so the user approves before any code changes.

Upgrade packages that move together as one unit:
- `vite` with `@vitejs/plugin-react` and `vite-plugin-pwa`
- `express` with `express-rate-limit`
- `typescript` with `typescript-eslint`

## Commit and deploy

Only when the user asks.
- Site: commit `package.json` and `package-lock.json` only, with a one-line message such as "Update dependencies". Do not include the user's other uncommitted work.
- Backend: commit and push inside `backend_server/` only. Do not bump the submodule pointer in the parent repo.
- Backend fixes reach production only on redeploy. Follow `CLAUDE.local.md` for the current deploy method.
