# DesignTool

**File:** `src/components/DesignTool.tsx`
**CSS:** `src/components/DesignTool.css`

An admin-only floating panel for live-editing the colour, font and size of selected text anywhere on the site, applied by wrapping the selection in a styled `<span>`.

## Usage

```tsx
<DesignTool />
```

No props. Mounted once, globally, in `App.tsx`. Renders nothing unless all of the following are true:

- the user is an admin (`useAdmin`)
- the per-user `designToolEnabled` flag on their Firestore `users` doc is `true` (toggled from the Profile page, cached in `localStorage` and mirrored live via a `design-tool-toggle` window event)

When visible, it's a draggable panel (drag by its title bar) that tracks `selectionchange`: selecting text elsewhere on the page shows the selection's current colour/font/size (or `<mixed>` if the selection spans more than one value), which "Apply to selection" then overwrites by wrapping the selected range in a `<span>` with inline styles. A saved-range fallback lets the colour wheel or dropdowns be used without losing the selection first (native selection collapses on click into the panel).

## Customising

- **Curated font list / palette swatches:** `CURATED_FONTS`, `PALETTE` constants at the top of the file. `AUTO_FONTS` (from `src/utils/autoFonts.ts`) is appended automatically so new fonts show up without code changes.
- **Font size options:** `FONT_SIZES` array.
- **Enabling for a user:** the "Design Tool" toggle on the Profile page, admin-only.
