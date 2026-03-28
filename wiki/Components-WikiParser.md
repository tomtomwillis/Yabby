# WikiParser

**File:** `src/components/WikiParser.tsx`

Fetches an HTML wiki file from the public directory and renders it inside the app, with collapsible `<h1>` sections, responsive tables, and images.

## Props

| Prop | Type | Description |
|------|------|-------------|
| `htmlFile` | `string` (optional) | Path to the HTML file to load. Defaults to `/wiki/YabbyVilleWiki.html` |
| `className` | `string` (optional) | Extra CSS class added to the outer container |

## Usage

```tsx
<WikiParser />
<WikiParser htmlFile="/wiki/CustomPage.html" className="my-wiki" />
```

## What It Does

1. Fetches the HTML file with `fetch()`.
2. If the file is a full HTML document, strips everything outside `<body>`.
3. Removes all inline `style=""`, `width="..."`, and `height="..."` attributes so the app's own CSS controls presentation.
4. Parses the cleaned HTML with `html-react-parser` and transforms certain elements:
   - `<h1>` — wrapped in a collapsible section with a toggle arrow. Clicking the heading opens or closes the section content.
   - `<table>` — wrapped in a horizontally scrollable `<div>`.
   - `<pre>` — forced to `white-space: pre-wrap` so code doesn't overflow on narrow screens.
   - `<img>` — made responsive (`max-width: 100%`).

Used on the [Wiki page](Pages-Wiki).

## Customising

To change which HTML file is loaded by default, pass a different `htmlFile` prop or update the default value in the component. The collapsible behaviour is entirely client-side — the source HTML does not need any special markup beyond standard `<h1>` tags.
