# UsernameLink

**File:** `src/components/basic/UsernameLink.tsx`

A username rendered as a link to that user's profile, with a profile hover card — the same floating-card system used for `@`-tagged albums, artists and calendar events.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `userId` | `string` (optional) | Target user's uid. If omitted, renders plain (non-linked) text. |
| `username` | `string` | Display text. |
| `className` | `string` (optional) | Class applied to the link/span. |
| `disableHover` | `boolean` (optional) | Suppresses the profile card — used where the same profile is already shown on screen (e.g. the message board draws bio, join date and location in the post's gutter already). |

## Usage

```tsx
<UsernameLink userId={post.userId} username={post.username} />
```

Hovering (or focusing) opens a **hover** card via `useNavidromeCard()` with `target: { type: 'user', id: userId }`; clicking **pins** it. Its body is `UserCardBody` (`src/components/basic/UserCardBody.tsx`), rendered inside the same frame as album/artist/event cards — see [NavidromeCard](Components-NavidromeCard). A modified click (cmd/ctrl/shift/alt), or any tap on a touch device (`matchMedia('(hover: hover)')` is false), skips the card and navigates straight to `/user/:userId`.

Inside a pinned card that hosts inner tags (currently an event card's "added by" line), clicking the username replaces that card in place and offers a `‹ back` button, via `CardHostContext` — see [NavidromeCard](Components-NavidromeCard#cards-within-cards).

Used in `UserMessages` (forum posts), `EventList`/`EventCardBody` (event authors), and anywhere else a member's name links out.

## Customising

- The card's own sizing/behaviour lives in `NavidromeCard.tsx` (`USER_SIZE`, etc.) and `UserCardBody.tsx`, not here — this component only wires up the open/close calls.
- Card content and styling: `UserCardBody.tsx` / `UserCardBody.css`.
