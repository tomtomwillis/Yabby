# Header

**File:** `src/components/basic/Header.tsx`

The site header with animated title, subtitle, and grouped navigation. Collapses into a full-screen slide-in menu on narrow screens.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `title` | `string` | Main heading text |
| `subtitle` | `string` | Smaller subtitle line below the title |

## Navigation

Links are organised into three named groups defined as `navGroups` inside the component:

| Group | Links |
|-------|-------|
| Music | listen (Navidrome), upload, request (SLSK), radio |
| Social | message board, travel, lists, film club, stickers |
| Yabby | profile, news, wiki, issues, media management (media managers only) |

On desktop, hovering or clicking a group name reveals its sub-links in a second row. The dropdown hides automatically after 2.5 seconds of mouse-leave. On mobile, all groups and their sub-links are shown in a full-screen overlay panel that slides in from the left.

The "media management" link is conditional: it only appears when `useMediaManager()` returns `isMediaManager === true`.

## Usage

```tsx
<Header title="Welcome to Yabbyville" subtitle="some subtitle" />
```

Styling is in `Header.css`. The floating text animation comes from `TextAnimations.css`.

## Customising

To add a link, insert a new `NavLink` object into the relevant group's `links` array in `Header.tsx`. Set `external: true` to open in a new tab. Set `condition: someBoolean` to show the link only when that condition is truthy.
