# Button

**File:** `src/components/basic/Button.tsx`

Reusable button component used throughout the app.

## Types

| Type | Description |
|------|-------------|
| `basic` | Standard button with a text label |
| `close` | Button with an X icon |
| `arrow-left` | Left arrow button |
| `arrow-right` | Right arrow button |
| `submit` | Form submit button |

## Props

- `label` - button text (for `basic` type)
- `onClick` - click handler
- `type` - one of the types above
- `size` - icon size (for icon-based types)

## Usage

```tsx
<Button label="Click Me" onClick={handleClick} type="basic" />
<Button type="close" onClick={handleClose} size="2em" />
```

Styling is in `Button.css` alongside the component. Changes here affect every button in the app.
