# Travel Page

**File:** `src/pages/TravelPage.tsx`
**Route:** `/travel`

A community travel map where members can pin and browse real-world place recommendations.

## What It Shows

- An interactive Leaflet map with pins for every recommended place
- A sidebar (desktop) and collapsible panel (mobile) with city, user, and category filters
- A scrollable recommendation list below the map, sorted by most recent activity
- A place-add box for searching and pinning a new location via Nominatim/OSM
- A confirmation form that appears above the list when a place has been selected for pinning
- A scroll arrow button that toggles between scrolling down to the list and back to the top

## Deep Linking

Two query parameters are supported for linking directly to specific content:

| Parameter | Effect |
|-----------|--------|
| `?city=<cityKey>` | Pre-applies the city filter and pans the map to the first place in that city |
| `?place=<placeId>` | Auto-expands the matching place in the recommendation list and pans the map to it |

These are produced by the `/city` and `/travel` slash commands in `ForumMessageBox`.

## Components Used

- `Header` — page title "Travel" and subtitle
- `TravelMap` — Leaflet map with place markers and popup bubbles
- `TravelAddBox` — Nominatim search input for finding a new place
- `TravelConfirmForm` — form shown after a place is selected, to add a comment, photos, and category
- `TravelFilters` — city, user, and category filter dropdowns
- `TravelPlaceBubble` — card shown in map popups and expanded list rows
- `TravelRecommendationList` — scrollable list of all places with expand/collapse

## Data

Places are stored in the `places` Firestore collection. Each document is denormalized with coordinates, city, contributor count, and first-contributor info so the list and map can be rendered with a single collection read.

Contributions (one per user per place) live in `places/{placeId}/contributions/{userId}`.

The `loadUserMemberships()` function does one subcollection read per place to build the user filter — avoid adding more subcollection reads in this function.

## Customising

- To change the default map view, update `TravelMap`'s initial center/zoom.
- Category options are defined in `travelTypes.ts`.
- Photo uploads go to `VITE_MEDIA_API_URL`; contribution CRUD goes to `VITE_TRAVEL_API_URL`.
