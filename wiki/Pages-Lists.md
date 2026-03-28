# Lists Page

**File:** `src/pages/ListsPage.tsx` and `src/pages/ListDetailPage.tsx`
**Routes:** `/lists` and `/lists/:listId`

Users can create and share lists of albums.

## Lists Overview (`/lists`)

- Shows all public lists and the logged-in user's own lists
- Each list card shows the title, owner, item count, and a preview image
- "Create a new list" button opens the creation form
- Clicking a list navigates to its detail page

## List Detail (`/lists/:listId`)

- Shows all items in a list with album art, title, and artist
- List owners can edit the title, add/remove/reorder items, toggle public/collaborative, and delete the list
- Collaborative lists can be edited by any logged-in user
- Items can be albums (searched from Navidrome) or custom entries with a title and image URL

## Components Used

- `CreateList` - form for creating/editing lists with album search
- `ListItem` - renders individual list items
- `AlbumSearchBox` - search for albums to add

## Customising

- List title max length and other validation is in `firestore.rules` under the `lists` collection
- To change how many lists show per page, edit the pagination in `ListsPage.tsx`
