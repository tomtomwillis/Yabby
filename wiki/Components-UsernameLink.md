# UsernameLink

**File:** `src/components/basic/UsernameLink.tsx`

A username rendered as a link to that user's profile, with a hover card showing avatar, location and bio.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `userId` | `string` (optional) | Target user's uid. If omitted, renders plain (non-linked) text. |
| `username` | `string` | Display text. |
| `className` | `string` (optional) | Class applied to the link/span. |

## Usage

```tsx
<UsernameLink userId={post.userId} username={post.username} />
```

On hover (or focus), after a 220ms delay, fetches the profile through the shared `userCache` and shows a card — avatar, location, bio, "click to view profile" hint — positioned below the link and flipped above if there isn't room. The card is `pointer-events: none` and portalled to `document.body`, so it can neither swallow the click on the link underneath it nor be clipped by a scrolling ancestor. On touch/coarse pointers the hover card is skipped entirely (`matchMedia('(hover: hover)')`) so a tap goes straight to navigation instead of flashing the card first.

Used in `UserMessages` (forum posts) for the poster's name.

## Customising

- **Open delay / card width:** `OPEN_DELAY`, `CARD_W`, `GAP` constants at the top of the file.
- **Card styling:** `UsernameLink.css`.
