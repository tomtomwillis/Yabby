# NowWatching

**File:** `src/components/film/NowWatching.tsx`

A self-contained card that fetches and displays the current month's film club selection without any admin controls.

## Props

This component takes no props.

## Usage

```tsx
<NowWatching />
```

Used on `FilmClubMessagePage` to give users context about which film is being discussed, without exposing the full Film Club management UI.

## What It Does

1. Reads the current month ID from `getCurrentMonthId()` (in `useFilmClub`).
2. Performs a one-time `getDoc` read from `filmClub/{monthId}` to retrieve the `currentFilm`, `downloadLinks`, and `currentFilmDescription` fields.
3. Migrates legacy `downloadLinks` shape (`{ small, medium, large }` object) to the current array format (`[{ label, url }]`) if needed.
4. Fetches the YouTube trailer for the selected film from the TMDB API using `VITE_TMDB_API_KEY`.
5. Renders a `FilmCard` labelled "Now watching" with the film poster, title, release year, overview, pitch, submitter username, leaving date, trailer link, download links, and optional admin description.
6. Returns `null` if no film has been set for the current month.

## Customising

- The "leaving date" shown on the card is always the last day of the current month — no configuration needed.
- Download links and the film description are managed by admins through the `FilmClub` component on the Film Club page.
