# CarouselAlbums

**File:** `src/components/CarouselAlbums.tsx`

Fetches the 10 most recently added albums from Navidrome and displays them in a `Carousel`.

No props. Used on the Home page.

```tsx
<CarouselAlbums />
```

Requires Navidrome to be configured in `.env`. Displays a loading state while fetching.

Clicking an album opens the pinned [NavidromeCard](Components-NavidromeCard) popup for it via `useNavidromeCard`, closing any other pinned card first. Cmd/ctrl/shift/alt-click bypasses this and follows the underlying link to Navidrome in a new tab instead.
