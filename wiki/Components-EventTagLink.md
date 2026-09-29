# EventTagLink

**File:** `src/components/events/EventTagLink.tsx`

A calendar event linked inside a rendered message — what the message board's Event Bot round-up is made of. Behaves exactly like an `@`-tagged Navidrome album/artist (`NavidromeTagLink`): hovering opens the event's card, clicking pins it, and a modified click (cmd/ctrl/shift/alt) still follows the plain link.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `eventId` | `string` | The event's document id. |
| `href` | `string` | The original `href` — used as the fallback for modified clicks. |
| `children` | `React.ReactNode` | The link text. |

## Usage

Not used directly — wired up by `parseMessageHTML` (`src/components/basic/messageText.tsx`) whenever a rendered link's `href` matches `parseEventLink()` (`src/components/events/eventTypes.ts`), i.e. a `https://yabbyville.xyz/calendar?event=:id` link:

```tsx
<EventTagLink eventId={eventId} href={href}>{children}</EventTagLink>
```

Opens the shared [NavidromeCard](Components-NavidromeCard) frame with `target: { type: 'event', id: eventId }`, rendering `EventCardBody` inside it.

## Customising

- The link format events are posted with (`eventPath`) and the matcher that recognises it (`parseEventLink`) both live in `eventTypes.ts` — keep them in sync if the calendar's route or query param ever changes.
