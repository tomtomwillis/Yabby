# Calendar Page

**File:** `src/pages/CalendarPage.tsx`
**Route:** `/calendar`

A community events calendar — gigs, club nights, radio shows, releases and general get-togethers — that any signed-in member can add to. Month and week grid views, a scrolling list of upcoming events grouped by day, faceted filtering, and each member's own private "interested?" calendar with an exportable `.ics` feed.

## What It Shows

- **Bar** (`cal-bar`, pinned to the top of the column) — prev/today/next navigation, the current month or week range as the heading, a month/week view switch, and a colour key for the six event categories (`gig`, `club`, `radio`, `release`, `event`, `other`) that doubles as a quick type filter.
- **Grid** — `CalendarMonth` (a dot per event, coloured by category, ringed if the member is interested) or `CalendarWeek` (each day as a column of time + title rows), depending on the chosen view. Defaults to week view under 760px width, since a month cell there is too narrow for anything but dots.
- **Settings + filters** (`CalendarSettings`) — a collapsible panel with faceted filters (city, type, hosted by, added by, calendar) each showing live counts for what's currently on screen, plus the member's own calendar settings (`CalendarMine`) once opened.
- **Add band** (`cal-add`) — a single line that expands into `EventForm` when clicked.
- **List** — events from the selected day onward, grouped by date, as collapsible ledger rows (`EventList`). Runs past the grid's own range a page at a time ("show more") via `loadEventsFrom`.

## Adding / editing events

`EventForm` (`src/components/events/EventForm.tsx`) collects title, category, date, start/end time + IANA time zone, location, city (`CityInput`, autocompleting from every city already in use), a lineup (`LineupEditor`, tagging Navidrome artists), cost, an `@`-taggable description (`TagTextarea`), up to 5 links, an optional image, and a "this is my own event" (`hosted`) toggle that defaults on for radio shows only. It can also be filled automatically from a `communalleisure.com` event page URL (`importCommunalLeisure`, through the backend). Only the title and date are required; everything else is omitted from the saved document when empty. Writes go through `createEvent`/`updateEvent` in `src/utils/eventsApi.ts`.

Any signed-in member with a username may add an event; only its author may edit it; the author or an admin may delete it (`firestore.rules`).

## Filtering

Facets (`Facet[]`, the same shape the [Travel page](Pages-Travel) uses — `src/components/travel/TravelFilters.ts`) are computed client-side over whatever the grid's current month/week has loaded, each option showing a count with the facet itself excluded from its own count (so choosing "Glasgow" doesn't hide every other city's count). Filters persist in `localStorage` (`yabby.calendar.filters`) and are echoed into the URL via `?cal=` for a shared calendar. Deep links: `?event=:id` focuses a specific event (used by the Home widget, board hover cards and the Event Bot's posts), `?cal=:uid` filters to a member's calendar if they share it.

## Interested / private calendar

Ticking "interested?" on an event (`InterestedCheck`) adds it to the member's own private list (`eventInterests/{uid}`, one document, see [Firestore Structure](Firestore-Structure)) and increments a public count on the event itself. `useEventInterests()` (`src/utils/eventInterests.ts`) exposes the member's own tick set to any component that needs to mark "in your calendar". `CalendarMine` (inside the settings panel) lets a member:

- toggle whether others can filter the calendar to their ticks (`calendarPublic`)
- toggle whether their subscribe link is shown on their own profile (`calendarFeedPublic`)
- copy/subscribe (Apple, Outlook, Google) to their personal `.ics` feed, and retire the link if it leaks

## Components Used

- `CalendarMonth` / `CalendarWeek` — the grid views
- `CalendarSettings` — filters panel, wrapping `CalendarMine`
- `EventForm` — add/edit form, wrapping `CityInput`, `LineupEditor`, `TagTextarea`
- `EventList` — the day-grouped ledger rows, wrapping `EventLineup`, `InterestedCheck`, `UsernameLink`

Also used elsewhere: `HomeEvents` (Home page widget), `EventCardBody`/`EventTagLink` (the hover/pin card opened from an event link in a post), `ProfileCalendar` (the profile page's calendar-sharing row) — each documented separately as they're reused outside this page.

## Customising

- Event categories, colours and field limits: `EVENT_CATEGORIES` / `EVENT_LIMITS` in `src/components/events/eventTypes.ts`. Category values are also enforced in `firestore.rules` (`isValidEventFields`) — keep both in sync.
- Offered time zones: `EVENT_TIME_ZONES` in `eventTypes.ts`. An event saved in a zone not on this list still displays correctly; only the form's dropdown is limited.
- Reads are cached and paged through `src/utils/eventsApi.ts` (`loadEventsInRange`, `loadEventsFrom`, `getEvent`/`peekEvent`) — shared with the Home widget and the hover card, so the same range is never read twice in one session.
- The `/eventbot` weekly round-up is posted by an admin from the message board composer (`ForumMessageBox`'s `onEventAnnounce`) or by the backend on a schedule — see `EVENT_BOT_BOARDS` in `eventsApi.ts`.
