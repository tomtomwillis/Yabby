# Tips

**File:** `src/components/basic/Tips.tsx`

Displays a helpful tip banner, with visibility configurable per device type.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `text` | `React.ReactNode` | The tip content — can be a plain string or JSX (e.g. bold text, inline code) |
| `showOnMobile` | `boolean` | Show on mobile screens ≤768 px (default: `true`) |
| `showOnDesktop` | `boolean` | Show on desktop screens >768 px (default: `false`) |

## Usage

```tsx
<Tips
  text="Long press the heart to see who reacted"
  showOnMobile={true}
  showOnDesktop={false}
/>

<Tips
  showOnMobile
  showOnDesktop
  text={<>Type <code>/</code> to link to lists and travel recs</>}
/>
```

The component returns `null` when the current screen size does not match the configured visibility flags, so no DOM is rendered at all in that case.
