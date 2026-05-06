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

- **Current film card** — the film selected for the current month, with poster, title, release year, overview, pitch, submitter credit, trailer link, download links, and an optional description. Falls back to "No film selected for this month yet." if unset.
- **Next film card** — shown during the reveal phase (last week of the month) once the IRV winner has been calculated.
- **Action buttons** — links to the Film Club message board, submission page, and voting page. Text adapts based on whether the user has already submitted and whether voting is open or closed.
- **Submission status** — shows how many films have been submitted and when voting closes.
- **Admin panel** — visible to admins only (toggled by an "Admin" button):
  - List of current submissions with per-submission delete buttons
  - Download link editor (label + URL pairs, add/remove rows)
  - Film description textarea
  - Film search box to set or replace the currently playing film
  - Button to clear the current film from Firestore

## IRV Vote Counting

When the app enters the reveal phase (`isRevealPhase === true`) and no winner has been recorded yet, the component automatically runs Instant-Runoff Voting across the `filmClub/{monthId}/votes` subcollection and writes the winning film to `filmClub/{monthId}.nextFilm`. A `winnerCalculated` flag prevents this from running more than once.

## Firestore Reads

- Real-time `onSnapshot` on `filmClub/{monthId}` for the current month document
- One-time `getDocs` on `filmClub/{adminMonthId}/submissions` for the admin panel
- TMDB API fetch for trailer URLs (not a Firestore read)

## Customising

- The reveal phase timing is controlled by `isRevealPhase` from `useFilmClub` — see `src/utils/useFilmClub.ts`.
- Download link labels default to two empty rows; admins can add more with "+ Add link".
- The film description field accepts free-form text and is stored in `currentFilmDescription` on the month document.
