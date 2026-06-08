# FilmClubVote

**File:** `src/components/film/FilmClubVote.tsx`

The ranked-choice voting interface for Film Club. Users drag (desktop) or tap arrow buttons (mobile) to rank all submitted films, then save their ranking.

## Props

This component takes no props.

## Usage

```tsx
<FilmClubVote />
```

Used exclusively on the Film Club vote page (`/film-club-vote`). Accepts an optional `?month=YYYY-MM` query parameter to view voting for a specific month; defaults to the current month.

## What It Shows

- An ordered list of all submitted films for the target month, each shown as a `FilmCard` with a rank number and drag handle (desktop) or up/down arrow buttons (mobile)
- A "Save ranking" button that writes the user's ordered list to `filmClub/{monthId}/votes/{userId}`
- A link to the film submission page
- Save status feedback (saving / saved / error)
- A "Voting closed" message if `winnerCalculated` is set on the month document

## Interaction

- **Desktop** — cards are draggable; drop to reorder
- **Mobile** — up/down arrow buttons reorder cards one step at a time (drag-and-drop is disabled when `window.innerWidth <= 480`)

## Firestore Reads

- `getDoc` on `filmClub/{monthId}` — checks if voting is closed
- `getDocs` on `filmClub/{monthId}/submissions` — loads all submissions
- `getDoc` on `filmClub/{monthId}/votes/{userId}` — loads the user's existing ranking if any
- TMDB API fetches for trailer URLs (one per submission, in parallel)

## Customising

- The voting deadline is calculated as the last day of the month minus 5 days, matching the reveal-phase logic in `useFilmClub`.
- The mobile breakpoint is hardcoded to `window.innerWidth <= 480`. Adjust to change when arrow buttons replace drag handles.
