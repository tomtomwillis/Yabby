# RadioPlayer

**File:** `src/components/RadioPlayer.tsx`

A simple embedded radio player used as the mobile fallback inside `WebampRadio`. Displays now-playing metadata from the stream.

For the full Webamp-based player, see [WebampRadio](Components-WebampRadio) and the [Radio page](Pages-Radio).

## Customising

The stream URL and metadata source are configured in the component. Update them to point to your own Icecast or compatible stream.

Metadata is fetched using the `useRadioMetadata` hook (`src/utils/useRadioMetadata.ts`).
