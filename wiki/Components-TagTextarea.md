# TagTextarea

**File:** `src/components/basic/tagging/TagTextarea.tsx`

A form textarea with the message board's `@` and `/` tagging, the menu dropping down over the form. Used for event descriptions and comments (`EventForm`) and list item notes (`CreateList`). Only use it for text that is displayed through `parseMessageHTML`, which turns the `[Name](link)` it writes into links and hover cards — elsewhere the Markdown would show as typed.

The commands are the shared set described under [ForumMessageBox](Components-ForumMessageBox#tagging); board-only actions such as `/poll` are not offered here.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `value` | `string` | Controlled text |
| `onChange` | `(value: string) => void` | Called on typing and when a tag is inserted |
| `maxLength` | `number` | Character limit; a tag that would pass it is not inserted |
| `placeholder` | `string` | Placeholder text |
| `className` | `string` | Classes for the textarea itself |
| `id` | `string` | For a `<label htmlFor>` |

## Usage

```tsx
<TagTextarea
  className="ev-input ev-textarea"
  value={description}
  onChange={setDescription}
  maxLength={EVENT_LIMITS.description}
/>
```
