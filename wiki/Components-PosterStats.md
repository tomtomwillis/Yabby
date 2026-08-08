# PosterStats

**File:** `src/components/basic/PosterStats.tsx`

The forum identity line under a poster's name: when they joined, how many posts they've made, and where they are.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `userId` | `string` (optional) | The poster's uid. Renders nothing if omitted. |

## Usage

```tsx
<PosterStats userId={message.userId} />
```

Reads through the shared `userCache` (`getUserProfile`), so a thread with several posts by the same person costs one `users` read total, shared with `UsernameLink`'s hover bubble on the same name. Renders `joined <mon> <year>`, `<n> post(s)`, and a location (flag + text) — each only if present — and renders nothing at all if none of the three are available.

Used in `UserMessages`, `MessageBoard`, and `MessageBoardPage`.

## Customising

Month abbreviations come from the `MONTHS` array at the top of the file. Styling is under the `.user-message-poster-stats` class, in the consuming component's CSS.
