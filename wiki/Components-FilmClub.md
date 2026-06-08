# FilmClub

**File:** `src/components/film/FilmClub.tsx`

The main Film Club feature component. Displays the current and upcoming films, manages submission/voting actions, and provides an admin panel for controlling film club data.

## Props

This component takes no props.

## Usage

```tsx
<FilmClub />
```

Used exclusively on the Film Club page (`src/pages/FilmClub.tsx`).

## What It Shows

- **Current film card** — the film selected for the current month, with poster, title, release year, overview, pitch, submitter credit, trailer link, magnet download links, direct download links, and an optional admin description. If the current month has no `currentFilm` set but the previous month has a `nextFilm`, that is shown as a fallback until the admin promotes it.
- **Next film card** — shown during the reveal phase (last five days of the month) once the IRV winner has been calculated.
- **Action buttons** — links to the Film Club message board, submission page, and voting page. Text adapts based on whether the user has already submitted and whether voting is open or closed (reveal phase).
- **Submission status** — shows how many films have been submitted and when voting closes.
- **Admin panel** — visible to admins only (toggled by an "Admin" button):
  - Re-run IRV winner calculation button
  - Next cinema showing date/time picker (reads/writes `cinema/state.nextShowingAt`)
  - List of current submissions with per-submission delete buttons
  - Magnet download link editor (label + URL pairs, add/remove rows)
  - Direct download link editor (label + URL pairs, add/remove rows)
  - Description textarea for the current film
  - Description textarea for the next month's film (reveal phase only)
  - Film search box to set or replace the currently playing film
  - Button to clear the current film from Firestore

## IRV Vote Counting

When the app enters the reveal phase (`isRevealPhase === true`) and no winner has been recorded yet, the component automatically runs Instant-Runoff Voting across the `filmClub/{monthId}/votes` subcollection and writes the winning film to `filmClub/{monthId}.nextFilm`. A `winnerCalculated` flag prevents this from running more than once per month. Admins can force a re-run at any time via the admin panel.

## Auto-Promotion

At the start of each month, if the current month document has no `currentFilm` set but the previous month document has a `nextFilm`, admin users trigger an automatic promotion: the previous month's `nextFilm` (and its description, if any) is written to the current month's `currentFilm`. This runs once via a `useRef` guard.

## Firestore Reads

- Real-time `onSnapshot` on `filmClub/{monthId}` and `filmClub/{prevMonthId}` for the month documents
- Real-time `onSnapshot` on `cinema/state` for the next cinema showing time
- One-time `getDocs` on `filmClub/{adminMonthId}/submissions` for the admin panel
- TMDB API fetches for current and next film trailer URLs (not Firestore reads)

## Customising

- The reveal phase timing is controlled by `isRevealPhase` from `useFilmClub` — see `src/utils/useFilmClub.ts`. The reveal phase begins when 5 or fewer days remain in the month.
- Magnet and direct download links can each have any number of rows; admins add rows with the "+ Add link" button.
- Film descriptions (current and next month) are stored in `currentFilmDescription` and `nextFilmDescription` on the month document.
