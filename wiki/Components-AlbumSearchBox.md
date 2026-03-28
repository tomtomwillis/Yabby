# AlbumSearchBox

**File:** `src/components/basic/AlbumSearchBox.tsx`

A search input that lets users find albums by name or paste a Navidrome URL.

## Props

- `placeholder` - input placeholder text
- `onAlbumSelect` - called with the album ID when a search result is clicked
- `onUrlSubmit` - called with the URL when a Navidrome URL is pasted

## Behaviour

- Typing triggers a search after 3 characters (300ms debounce)
- Pasting a URL starting with `https:` disables search and shows a submit button
- Shows up to 5 results with album name and artist
- Input clears after selection

## Usage

```tsx
<AlbumSearchBox
  placeholder="Find an album..."
  onAlbumSelect={(id) => loadAlbum(id)}
  onUrlSubmit={(url) => handleUrl(url)}
/>
```
