# HelpLink

**File:** `src/components/basic/HelpLink.tsx`

A small inline link that renders as a `?` button and navigates to a help or wiki page.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `to` | `string` | React Router path to navigate to when clicked |
| `title` | `string` | Tooltip text shown on hover (default: `"Help"`) |

## Usage

```tsx
<HelpLink to="/wiki" title="Learn more about Film Club" />
```

## Customising

- Style the link via the `.help-link` class in `src/components/basic/HelpLink.css`.
- Pass any internal route path to `to` — it uses React Router's `<Link>` so it will not cause a full page reload.
