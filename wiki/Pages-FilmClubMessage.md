# Film Club Message Page

**File:** `src/pages/FilmClubMessagePage.tsx`
**Route:** `/filmclubmessage`

A dedicated chat board for discussing the current month's film club selection.

## What It Shows

- Site header with "Film Club Chat" title and "Discuss This Month's Film" subtitle
- `NowWatching` card showing the currently selected film
- A randomly-selected usage tip (reaction tooltip hint or tagging hint)
- Full message board scoped to the `filmClubMessages` Firestore collection, with reactions and threaded replies enabled

## Components Used

- `Header` — page title and subtitle
- `NowWatching` — reads and displays the current film from Firestore
- `Tips` — rotating contextual tips for the user
- `MessageBoard` — full forum board configured with `collectionName="filmClubMessages"`, `enableReactions={true}`, and `enableReplies={true}`

## Customising

- To change the tips shown, edit the `tips` array at the top of `FilmClubMessagePage.tsx`.
- The Firestore collection for messages is `filmClubMessages` — all Film Club chat messages are stored separately from the main message board (`messages` collection).
