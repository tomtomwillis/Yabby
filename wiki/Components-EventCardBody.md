# EventCardBody

**File:** `src/components/events/EventCardBody.tsx`

The body rendered inside a [NavidromeCard](Components-NavidromeCard) frame when it opens on a calendar event (`target.type === 'event'`) — the card `EventTagLink` and `HomeEvents` open, and the one the message board's Event Bot round-up links to.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `eventId` | `string` | The event's document id. |
| `onLightbox` | `(url: string) => void` | Opens the event's image full-screen. |
| `onContent` | `(content: HTMLElement) => void` (optional) | Called once the event — or why there is none — has rendered, so the card frame can measure and fit itself before appearing. |
| `onClose` | `() => void` (optional) | Called when a link inside the card leads to the calendar itself, so the card doesn't stay open covering the page it just navigated to. |

## Usage

Not used directly — rendered by `NavidromeCard` when `target.type === 'event'`:

```tsx
<EventCardBody eventId={target.id} onLightbox={setLightbox} onContent={sizeBodyToContent} onClose={onClose} />
```

Seeds its initial state from `peekEvent()` (`src/utils/eventsApi.ts`), so an event already loaded elsewhere in the session (the grid, the list, another card) is drawn on the very first frame instead of a "loading" placeholder. Shows image, category, title, a facts list (when/where/lineup/cost/added by), the description (through `parseMessageHTML`, so the author's own `@`-tags render as cards — see [NavidromeCard § Cards within cards](Components-NavidromeCard)), external links, the `InterestedCheck` tick, and a link into the calendar at that event.

## Customising

- Styling: `eventCard.css` (`ec-*` classes) plus the shared `nc-*`/`ul-*` frame classes.
- The lineup row is rendered by `EventLineup` (`src/components/events/EventLineup.tsx`) — each act with a linked Navidrome artist is itself a tag, opening its own card in this one's place.
