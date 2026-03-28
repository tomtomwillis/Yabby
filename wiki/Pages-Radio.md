# Radio Page

**File:** `src/pages/Radio.tsx`
**Route:** `/radio`

A dedicated page for the community radio stream.

## Features

- Webamp player (a Winamp-style audio player in the browser) for streaming audio
- Now-playing metadata display from the Icecast stream
- Customisable player skins (stored in `public/skins/`)

## Components Used

- `WebampRadio` - the Webamp player integration (also used on the Home page)
- `RadioPlayer` - simpler fallback player rendered by `WebampRadio` on mobile

## Customising

- To change the radio stream URL, update the relevant configuration in the radio components
- To add Webamp skins, place `.wsz` skin files in `public/skins/`
- The radio metadata is read from an Icecast stream using the `icecast-metadata-js` library
