import { fetchSubsonicXml, NAVIDROME_SERVER_URL } from './navidrome';

export interface LibraryItem {
  type: 'artist' | 'album';
  id: string;
  name: string;
  /** The album's artist, to tell two albums of the same name apart. */
  artist?: string;
}

/** The web UI address of an artist or album — the form @-tags are written in,
 *  which the board and the calendar render as a hover card. */
export function navidromeHref(type: LibraryItem['type'], id: string): string {
  return `${NAVIDROME_SERVER_URL}/app/#/${type}/${encodeURIComponent(id)}/show`;
}

// Navidrome's artist search also returns every name credited on a track —
// composers, "feat." guests, mis-tagged track titles — which have no albums
// and so nothing for the hover card to show. Ask for extra to filter from.
const ARTIST_OVERFETCH = 5;

/** Artists (only those with albums), then albums, matching `query` in the library. */
export async function searchLibrary(
  query: string,
  { artists = 5, albums = 0 }: { artists?: number; albums?: number } = {},
): Promise<LibraryItem[]> {
  const xml = await fetchSubsonicXml('search3', {
    query,
    artistCount: artists * ARTIST_OVERFETCH,
    albumCount: albums,
    songCount: 0,
  });
  // Direct children only: OpenSubsonic nests <artist> inside other elements.
  const results = Array.from(xml.getElementsByTagName('searchResult3')[0]?.children ?? []);
  const read = (tag: 'artist' | 'album', count: number): LibraryItem[] =>
    results
      .filter((el) => el.tagName === tag && (tag === 'album' || Number(el.getAttribute('albumCount')) > 0))
      .map((el) => ({
        type: tag,
        id: el.getAttribute('id') || '',
        name: el.getAttribute('name') || '',
        artist: tag === 'album' ? el.getAttribute('artist') || undefined : undefined,
      }))
      .filter((item) => item.id && item.name)
      .slice(0, count);
  return [...read('artist', artists), ...read('album', albums)];
}

export interface LibrarySong {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  albumId: string;
}

/** Tracks matching `query`. The web UI has no page for a track, so a tagged
 *  one links to its album. */
export async function searchSongs(query: string, count = 6): Promise<LibrarySong[]> {
  const xml = await fetchSubsonicXml('search3', { query, artistCount: 0, albumCount: 0, songCount: count });
  return Array.from(xml.getElementsByTagName('searchResult3')[0]?.children ?? [])
    .filter((el) => el.tagName === 'song')
    .map((el) => ({
      id: el.getAttribute('id') || '',
      title: el.getAttribute('title') || '',
      artist: el.getAttribute('artist') || undefined,
      album: el.getAttribute('album') || undefined,
      albumId: el.getAttribute('albumId') || '',
    }))
    .filter((song) => song.id && song.title && song.albumId);
}
