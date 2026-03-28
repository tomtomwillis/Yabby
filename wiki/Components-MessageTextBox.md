# MessageTextBox

**File:** `src/components/basic/MessageTextBox.tsx`

A plain text input box with word/character limits and auto-resizing. Used for sticker messages.

## Props

- `placeholder` - placeholder text (default: `"Type here"`)
- `value` - controlled input value
- `onSend` - called when the user submits (send button or Ctrl/Cmd+Enter)
- `onChange` - called on text change
- `disabled` - disable input (default: `false`)
- `maxWords` - word limit (default: `250`)
- `showSendButton` - show/hide send button (default: `true`)
- `showCounter` - show/hide word counter (default: `true`)

## Usage

```tsx
<MessageTextBox
  placeholder="Write a message..."
  maxWords={100}
  onSend={(text) => handleSend(text)}
/>
```

For rich text with artist/album tagging, use `ForumMessageBox` instead.
