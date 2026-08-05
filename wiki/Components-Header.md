# Header

**File:** `src/components/basic/Header.tsx`

The site header with navigation links and the app title. Collapses into a hamburger menu on narrow screens.

## Props

- `title` - main title text
- `subtitle` - subtitle text below the title

## Navigation

Navigation links (Home, Stickers, Lists, Message Board, etc.) are defined inside the component. To add or remove pages from the nav, edit the links array in `Header.tsx`.

## Usage

```tsx
<Header title="Yabbyville" subtitle="Your music, your way" />
```

Styling is in `Header.css`. The floating text animation comes from `TextAnimations.css`.
