# HomeEvents

**File:** `src/components/events/HomeEvents.tsx`

The Home page's calendar widget — a week at a glance, Monday to Sunday, each day a short list of events (time + title, coloured by category). Hovering an event opens the same card the message board's Event Bot posts open; clicking pins it. Shares its data cache with the [Calendar Page](Pages-CalendarPage), so a week already seen there (or by another widget) costs nothing to redraw.

## Exports

Two components:

### `HomeEvents`

| Prop | Type | Description |
|------|------|-------------|
| `weekStart` | `string` | Monday of the week to show, `"YYYY-MM-DD"` |

### `HomeEventsNav`

A `‹ 28 sep – 4 oct ›` control meant to sit at the far end of the section heading (the `Section` component's `end` slot on the Home dashboard).

| Prop | Type | Description |
|------|------|-------------|
| `weekStart` | `string` | The week currently shown, for the range label |
| `onStep` | `(direction: -1 \| 1) => void` | Called to move a week back/forward |

## Usage

```tsx
const [eventWeek, setEventWeek] = useState(() => startOfWeek(todayISO()));

<Section
  title={`☷ ${weekTitle(eventWeek, today)}`}
  to="/calendar"
  end={<HomeEventsNav weekStart={eventWeek} onStep={(d) => setEventWeek((w) => addDays(w, d * 7))} />}
>
  <HomeEvents weekStart={eventWeek} />
</Section>
```

Up to 3 events are shown per day (`MAX_PER_DAY`); a day with more gets a "+N more" link straight into the calendar at that event. An empty week shows "nothing on yet. add something?" linking to `/calendar`.

## Customising

- Events per day cap: `MAX_PER_DAY`.
- Data comes from `loadEventsInRange` in `src/utils/eventsApi.ts` — the same range cache the calendar page and the hover card use.
- Styling: `HomeEvents.css`.
