# UserCardBody

**File:** `src/components/basic/UserCardBody.tsx`

The body rendered inside a [NavidromeCard](Components-NavidromeCard) frame when it opens on a member's profile (`target.type === 'user'`) — the card `UsernameLink` opens on hover/click.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `userId` | `string` | The member's uid. |
| `onContent` | `(content: HTMLElement) => void` (optional) | Called once the profile — or the fact there is none — has rendered, so the card frame can measure it and fit itself before it appears. |
| `onClose` | `() => void` (optional) | Called when the "view profile →" link is clicked, so the card closes on the way rather than staying open behind the navigation. |

## Usage

Not used directly — rendered by `NavidromeCard` when `target.type === 'user'`:

```tsx
<UserCardBody userId={target.id} onContent={sizeBodyToContent} onClose={onClose} />
```

Fetches the profile through the shared `getUserProfile` cache (`userCache.ts`) and shows avatar, name, location, bio (or "no bio yet"), and a site link if set, followed by a "view profile →" link to `/user/:userId`.

## Customising

- Markup and classes (`ul-*`) are shared with the old profile-bubble styling in `UserCardBody.css` — the same classes the event card and (previously) `UsernameLink`'s own bubble used.
- To add more profile fields to the card, edit the JSX here and add the field to `UserProfile` in `userCache.ts` if it isn't already loaded.
