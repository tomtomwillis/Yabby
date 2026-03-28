# UserMessages

**File:** `src/components/basic/UserMessages.tsx`

Displays a single user message with avatar, username, timestamp, and content. Used by the message board, sticker popups, and anywhere user-generated messages appear.

## Props

- `username` - the author's display name
- `message` - HTML message content (sanitised before rendering)
- `timestamp` - when the message was posted
- `userSticker` - avatar image path or emoji
- `onClose` / `hideCloseButton` - close button control
- `reactions` / `reactionCount` / `currentUserReacted` / `onToggleReaction` - heart reaction support

## Usage

```tsx
<UserMessage
  username="Jane"
  message="Great album!"
  timestamp="2025-09-21 11:00 AM"
  userSticker="/Stickers/avatar_star_blue.webp"
  hideCloseButton={true}
/>
```

Links in messages are rendered as clickable only if they point to `yabbyville.xyz`.
