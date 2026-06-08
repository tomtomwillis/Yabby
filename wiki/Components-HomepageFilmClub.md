# HomepageFilmClub

**File:** `src/components/film/HomepageFilmClub.tsx`

A compact Film Club widget for the home page. Shows the current month's film with poster, pitch, and links to the film club and voting pages.

## Props

This component takes no props.

## Usage

```tsx
<HomepageFilmClub />
```

Lazy-loaded on the Home page with `React.lazy` / `Suspense`. Returns `null` if no film has been set for the current month.

## What It Shows

- **Poster** — TMDB image at `w342` resolution, lazy-loaded
- **Title and release year**
- **Leaving date** — last day of the current month
- **Submitter credit** — username of who submitted the film (if set)
- **Pitch** — truncated to 20 words (the submitter's case for watching it)
- **Overview** — TMDB synopsis, also truncated to 20 words
- **Buttons** — links to the Film Club message board (`/filmclubmessage`) and the vote page (`/film-club-vote`)

## Data

Performs a one-time `getDoc` on `filmClub/{monthId}` and reads `currentFilm` from the document. The result is cached in `localStorage` for one hour to avoid repeated reads on every home page visit.

## Customising

- To change the truncation length, adjust the `limit` argument in the `truncate()` calls inside the component.
- The cache TTL is `CACHE_TTL = 60 * 60 * 1000` (one hour). Reduce it to see updated film data sooner.
