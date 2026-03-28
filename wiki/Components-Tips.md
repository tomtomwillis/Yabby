# Tips

**File:** `src/components/basic/Tips.tsx`

Displays a helpful tip to users, with visibility configurable per device type.

## Props

- `text` - the tip text
- `showOnMobile` - show on mobile devices (default: `true`)
- `showOnDesktop` - show on desktop (default: `false`)

## Usage

```tsx
<Tips
  text="Long press the heart to see who reacted"
  showOnMobile={true}
  showOnDesktop={false}
/>
```
