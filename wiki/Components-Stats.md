# Stats

**File:** `src/components/Stats.tsx`

Displays statistics fetched from the Navidrome server: total album count, total song count, and a daily "Song of the Day". Used on the Home page.

Lazy-loaded so it doesn't block the initial page render.

```tsx
<Stats />
```

No props. Requires Navidrome to be configured via environment variables. If the Navidrome connection fails, an error message is shown with a retry button.

## Song of the Day

The song is selected deterministically by hashing today's date to pick an album index, then hashing `date + "_track"` to pick a track within that album. The result is cached in `localStorage` and reused for the rest of the day to avoid repeated API calls.

## Note

The animated ASCII figure that previously appeared below the stats has been extracted into its own [`AsciiMan`](Components-AsciiMan) component and is now rendered separately at the bottom of the Home page.
