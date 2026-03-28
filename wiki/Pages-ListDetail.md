# List Detail Page

**File:** `src/pages/ListDetailPage.tsx`
**Route:** `/lists/:listId`

Shows the full contents of a single list and allows the owner (or any member for collaborative lists) to edit or delete it.

## What It Shows

- List title, author, item count, and creation date
- "Collaborative" badge if the list is collaborative
- Numbered list of items, each rendered by `ListItem`
- Edit and Delete buttons for users with edit access

## Access Control

- **Owner** can edit and delete.
- **Any logged-in user** can edit a collaborative list (but not delete it).
- Access is enforced server-side by Firestore security rules; the client-side `isOwner`/`canEdit` flags only control which buttons are shown.

## Editing

Clicking "Edit List" replaces the view with the `CreateList` component in `editMode`, passing the existing list data. On completion `handleEditComplete` reloads the list from Firestore and returns to view mode.

## Deletion

Deletes all items in `lists/{listId}/items` first, then deletes the parent `lists/{listId}` document, then navigates back to `/lists`.

## Components Used

- `Header` — page title and subtitle
- `ListItem` — renders each list entry
- `CreateList` — edit form (shown in place of the list when editing)
- `Button` — navigation and action buttons

## Customising

- Item sort order is fixed to the `order` field ascending. To allow user-defined reordering, edit `CreateList` and the `orderBy('order', 'asc')` query in `loadList`.
- The confirmation dialogs use native `confirm()` and `alert()`. Replace these with a modal component for a more polished experience.
