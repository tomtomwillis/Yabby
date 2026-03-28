# Oneko

**File:** `src/components/Oneko.tsx`

An opt-in pixel cat (`oneko.gif`) that follows the user's cursor around the screen.

## Usage

```tsx
<Oneko />
```

No props. Renders nothing directly — the cat is injected as a raw `<div>` appended to `document.body` so it can be positioned freely over the whole viewport.

## Behaviour

- **Enabled/disabled** per user. The preference is stored in Firestore (`users/{uid}.nekoEnabled`) and cached in `localStorage` for instant restore on the next page load.
- The cat is **not shown on mobile** (touch pointer) or when the user has `prefers-reduced-motion: reduce` set.
- The cat **spawns at a random position** within the central 70% of the viewport on first load.
- **Drag** the cat to reposition it. **Double-click** to pin it in place (it falls asleep); double-click again to wake it.
- When awake the cat chases the cursor, playing idle, scratch, and sleep animations when the cursor is still.

## Enabling/Disabling

Users toggle the cat from the Profile page. The Profile page writes the new value to Firestore and dispatches a `oneko-toggle` custom event on `window`, which `Oneko` listens for to update without a page reload.

To change the cat's movement speed, edit the `NEKO_SPEED` constant at the top of `Oneko.tsx` (default: `8`).
