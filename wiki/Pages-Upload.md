# Upload Page

**File:** `src/pages/Upload.tsx`
**Route:** `/upload`

Lets users upload files to the community's Copyparty server.

## How It Works

The page embeds the Copyparty upload interface in an iframe. The Copyparty server URL comes from the `VITE_COPYPARTY_BASE_URL` environment variable.

Without a Copyparty server configured, this page will be empty.

## Customising

- To replace Copyparty with a different upload solution, replace the iframe with your own upload component
- Tips shown to users can be edited directly in `Upload.tsx`
