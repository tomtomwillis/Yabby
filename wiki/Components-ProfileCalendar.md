# ProfileCalendar

**File:** `src/components/events/ProfileCalendar.tsx`

The "calendar" fact row on the [User Profile page](Pages-UserProfile), shown when a member has switched on either calendar-sharing setting.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `userId` | `string` | The profile's uid. |
| `viewable` | `boolean` | The member's `calendarPublic` setting — shows a link to their filtered calendar. |
| `subscribable` | `boolean` | The member's `calendarFeedPublic` setting — offers their `.ics` subscribe link. |

## Usage

```tsx
<ProfileCalendar userId={userId} viewable={profile.calendarPublic} subscribable={profile.calendarFeedPublic} />
```

`viewable` renders a link to `/calendar?cal=:userId` ("see what they're into"), which filters the calendar page to events that member has ticked "interested?" on. `subscribable` renders a "subscribe" button that, on click, asks the backend for a signed feed link (`getPublicFeedLink` in `src/utils/eventInterests.ts` — the backend re-checks the profile's sharing flag before issuing it) and then offers Apple/Outlook (`webcal:` link), Google Calendar (pre-filled "add by URL"), and a copyable raw address.

## Customising

- The feed link is only fetched on click, not on mount, since it costs a backend round trip.
- Styling: `up-cal*` classes in `UserProfile.css`.
