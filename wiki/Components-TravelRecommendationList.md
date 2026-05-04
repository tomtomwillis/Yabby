# TravelRecommendationList

**File:** `src/components/travel/TravelRecommendationList.tsx`

Renders a scrollable, paginated list of travel recommendations with expand/collapse rows and deep-link support.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `places` | `Place[]` | Filtered, sorted array of places to display |
| `currentUserId` | `string \| null` | UID of the logged-in user, passed to `TravelPlaceBubble` |
| `onFocus` | `(place: Place) => void` | Called when a row is expanded — used to pan the map |
| `onEditContribution` | `(placeId, userId, next) => Promise<void>` | Edit handler forwarded to `TravelPlaceBubble` |
| `onDeleteContribution` | `(placeId, userId) => Promise<void>` | Delete handler forwarded to `TravelPlaceBubble` |
| `onAddOwn` | `(place: Place) => void` (optional) | Forwarded to `TravelPlaceBubble` to let a user add their own contribution |
| `initialExpandedId` | `string \| null` (optional) | Place ID to expand automatically on mount — used for deep linking via `?place=` |

## Usage

```tsx
<TravelRecommendationList
  places={visiblePlaces}
  currentUserId={user?.uid ?? null}
  onFocus={(p) => setFocus({ lat: p.lat, lng: p.lng, zoom: 14 })}
  onEditContribution={editContribution}
  onDeleteContribution={deleteContribution}
  onAddOwn={handleAddOwn}
  initialExpandedId={deepLinkedPlaceId}
/>
```

## Behaviour

- Shows the first 20 places; a "Show N more" button reveals the rest.
- Clicking a collapsed row expands it, shows `TravelPlaceBubble` inline, and calls `onFocus`.
- Clicking an expanded row collapses it.
- When `initialExpandedId` is set, the matching place is expanded on mount (and whenever the prop changes).
- Places with 2 or more contributors show a shared star avatar; places with one contributor show that contributor's avatar.

## Customising

Change `PAGE_SIZE` (currently 20) to show more or fewer places before the "Show more" button appears.
