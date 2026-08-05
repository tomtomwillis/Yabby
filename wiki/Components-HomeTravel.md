# HomeTravel

**File:** `src/components/travel/HomeTravel.tsx`
**CSS:** `src/components/travel/HomeTravel.css` (plus shared `TravelMap.css`)

The home dashboard's travel widget: a small Leaflet map showing the five most recently active places, with a text index of links beneath it.

## Usage

```tsx
<HomeTravel />
```

No props. Lazy-loaded from `HomeDashboard.tsx` to keep Leaflet out of the eager home bundle. Queries the top 5 `places` docs ordered by `lastActivityAt`, reading only the place documents — no `contributions` subcollection reads — so the widget costs a fixed 5 reads per home load.

The map frames all returned pins on load (`FitPlaces`). Clicking a place name in the text index flies the map to that pin and opens its popup (`Focuser`); the popup is then re-centred in the small frame via `centrePopup`, since Leaflet's own `popupAnchor` offset would otherwise put it off the top of such a short viewport. Popup content links out to `/travel?place={id}` to open the place on the full travel map. On mobile (`max-width: 900px`) the map's `dragging` is disabled so a swipe scrolls the page instead of panning the map; the place links still work to focus a pin.

## Customising

- **Number of places shown:** `PLACE_LIMIT` constant.
- **Pin icons:** `singleAvatarIcon` / `multiContributorIcon` from `./TravelPinIcon`.
- **Category labels:** `PLACE_CATEGORIES` from `./travelTypes`.
