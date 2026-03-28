# Wiki Page

**File:** `src/pages/Wiki.tsx`
**Route:** `/wiki`

Displays a community FAQ/documentation page loaded from an HTML file.

## How It Works

The page loads `public/wiki/YabbyvilleWiki.html`, extracts the body content, fixes image paths, and renders it as collapsible sections. Sections are created from `<h1>` and `<h2>` elements in the HTML.

The wiki HTML is typically exported from Google Docs.

## Customising

1. Write or export your content as HTML
2. Save it to `public/wiki/YabbyvilleWiki.html`
3. Place any images in `public/wiki/images/`
4. The `WikiParser` component will handle rendering and section collapsing

Note: the `public/wiki/` folder is excluded by `.gitignore` for security, so it needs to be added manually to each deployment.
