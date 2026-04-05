# Media Manager Page

**File:** `src/pages/MediaManager.tsx`
**Route:** `/media`

A tabbed container for media management tools, restricted to users with the media manager role.

## What It Shows

- A loading state while permissions are checked
- An "Access Denied" message if the user is not a media manager
- A tab bar with two tabs: **Cover Art** and **Beets Import**
- The content area renders the component for whichever tab is active

## Components Used

- `Header` — page header, subtitle updates to match the active tab
- `CoverArtTool` — album cover art replacement tool (Cover Art tab)
- `BeetsTerminal` — interactive beets import terminal (Beets Import tab)
- `useMediaManager` — hook that checks the Firestore `mediaManagers` collection for the current user

## Customising

To add a new tool tab, add an entry to the `TABS` array at the top of the file with a unique `key` and `label`, then render the corresponding component inside the `media-tab-content` div conditional on `activeTab`.

Tab styles are in `src/pages/MediaManager.css`.

For an architectural overview of the entire media management section, see [Media Management](Media-Management).
