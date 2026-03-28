# ForumMessageBox

**File:** `src/components/basic/ForumMessageBox.tsx`

A rich text editor for the message board. Supports `@` tagging to link to artists and albums in Navidrome.

## Props

- `placeholder` - placeholder text
- `onSend` - called with the HTML content when submitted
- `disabled` - disable input
- `maxWords` / `maxChars` - content limits
- `showSendButton` - show/hide send button

## Tagging

Type `@` followed by at least 3 characters to search artists and albums. Click a result to insert it as a hyperlink pointing to your Navidrome instance.

## Usage

```tsx
<ForumMessageBox
  placeholder="Share your thoughts..."
  onSend={(html) => postMessage(html)}
  maxWords={250}
/>
```

Uses [react-simple-wysiwyg](https://github.com/nicksrandall/react-simple-wysiwyg) under the hood. Output HTML is sanitised with DOMPurify before storage.
