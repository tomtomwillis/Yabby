# Wiki Page

**File:** `src/pages/Wiki.tsx`
**Route:** `/wiki`

Displays a community wiki where admins can write and publish Markdown content stored in Firestore.

## What It Shows

- Collapsible sections driven by `# Heading` lines in the stored Markdown
- Rendered Markdown inside each section (subheadings, bold, italic, lists, links, images, code, tables)
- An "Edit Wiki" button visible only to admins
- A markdown guide tip bar shown to admins on all screen sizes

## How It Works

Content is stored as a single Markdown string in the Firestore document `wiki/content` (field `text`). On load, `getDoc` fetches this document. The text is split into sections at every `# ` line — each section becomes a collapsible accordion item. Section bodies are rendered by passing Markdown through `marked` and then `sanitizeWikiHtml` (DOMPurify), which is then rendered with `html-react-parser`.

Deep linking is supported: if the URL contains a hash (e.g. `/wiki#getting-started`), the matching section is automatically opened and scrolled into view on first load. Clicking a closed section updates the URL hash without a navigation.

## Admin Edit Mode

Admins see an "Edit Wiki" button. Clicking it opens an edit panel containing:

- A sidebar listing all headings parsed from the current edit text (hidden on mobile). Clicking a heading scrolls the textarea to that line.
- A full-height textarea for writing Markdown.
- Image attachment: paste an image from the clipboard or click "Attach image" to select a file (max 5 MB). A preview appears; clicking "Insert image" uploads to `VITE_MEDIA_API_URL/mb-images/upload` and inserts the returned URL as a Markdown image tag at the cursor.
- Save and Cancel buttons. Save writes back to `wiki/content` in Firestore with `updatedAt` and `updatedBy` fields.

## Components Used

- `Header` — page title "Wiki" and subtitle "How to use Yabby"
- `Tips` — markdown syntax guide shown to admins on all devices

## Customising

- To change the Firestore document path, update the `doc(db, 'wiki', 'content')` calls in `Wiki.tsx`.
- Markdown rendering is handled by `marked` + `sanitizeWikiHtml` in `src/utils/sanitise.ts`. To allow additional HTML tags in wiki content, extend the `ALLOWED_TAGS` list in `sanitizeWikiHtml`.
- The image upload endpoint is `VITE_MEDIA_API_URL/mb-images/upload` — the same endpoint used by the message board.
