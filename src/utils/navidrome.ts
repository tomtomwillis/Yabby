import { md5 } from 'js-md5';
import { musicSessionReady } from './musicSession';

const SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
const CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID;

// Same-origin proxy (backend routes/music.js). Caddy adds the proxy account's
// credentials, so nothing here knows a Navidrome password. Media requests are
// authorised by the music session cookie (musicSession.ts).
const PROXY_BASE = '/api/music/rest';

export interface SubsonicAuth {
  u: string;
  t: string;
  s: string;
}

// Subsonic token auth (u + t + s): t = md5(password + salt). Keeps the
// plaintext password out of URLs — they end up in history, access logs and
// the DOM (cover-art img src). One salt per session is fine; the token is
// only valid with this salt.
export function createSubsonicAuth(username: string, password: string): SubsonicAuth {
  const salt = Math.random().toString(36).slice(2, 12);
  return { u: username, t: md5(`${password}${salt}`), s: salt };
}

/** Base server URL, for non-API links like /app/#/album/... */
export const NAVIDROME_SERVER_URL: string = SERVER_URL;

const SERVER_ORIGIN = (() => {
  try {
    return new URL(SERVER_URL).origin;
  } catch {
    return '';
  }
})();

/**
 * Build a Subsonic REST URL. Params are URL-encoded; array values are repeated
 * (e.g. songId for playlists). Without `auth` the URL goes through the proxy,
 * which allows only the read-only endpoints in the backend's utils/musicGate.js.
 * With `auth` (a member's own Navidrome login) it goes to Navidrome directly.
 */
export function subsonicUrl(endpoint: string, params: Record<string, string | number | string[]> = {}, auth?: SubsonicAuth): string {
  const search = auth
    ? new URLSearchParams({ u: auth.u, t: auth.t, s: auth.s, v: '1.16.1', c: CLIENT_ID })
    : new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value.forEach(v => search.append(key, v));
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  const base = auth ? `${SERVER_URL}/rest` : PROXY_BASE;
  return `${base}/${endpoint}${query ? `?${query}` : ''}`;
}

/** Cover-art image URL for use in img src. Omit size for the original image. */
export function coverArtUrl(coverArtId: string, size?: number): string {
  return subsonicUrl('getCoverArt', size ? { id: coverArtId, size } : { id: coverArtId });
}

/** Cover art for an album by its id, for stored items that keep only the id. */
export function albumCoverUrl(albumId: string, size?: number): string {
  return coverArtUrl(`al-${albumId}`, size);
}

export interface AlbumSummary {
  id: string;
  artist: string;
  title: string;
  cover: string;
}

/** Name, artist and cover URL of one album. Throws if Navidrome does not have it. */
export async function fetchAlbumSummary(albumId: string): Promise<AlbumSummary> {
  const xmlDoc = await fetchSubsonicXml('getAlbum', { id: albumId });
  const album = xmlDoc.querySelector('album');
  if (!album) throw new Error('Album not found in response');
  const id = album.getAttribute('id') || albumId;
  return {
    id,
    artist: album.getAttribute('artist') || 'Unknown Artist',
    title: album.getAttribute('name') || 'Unknown Album',
    cover: coverArtUrl(album.getAttribute('coverArt') || `al-${id}`),
  };
}

export interface NavidromeLink {
  type: 'album' | 'artist';
  id: string;
}

/** Recognise an album or artist link into the Navidrome web UI, as inserted by
 *  the message box's @ tagging. Returns null for anything else, including links
 *  to a different host. */
export function parseNavidromeLink(href: string): NavidromeLink | null {
  if (!SERVER_ORIGIN) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.origin !== SERVER_ORIGIN) return null;
  // The web UI is a hash router, so the route is in the fragment, not the path.
  const match = url.hash.match(/^#\/(album|artist)\/([^/]+)\/show$/);
  if (!match) return null;
  return { type: match[1] as 'album' | 'artist', id: decodeURIComponent(match[2]) };
}

/** Fetch a Subsonic endpoint and return the parsed XML document. Throws on HTTP, parse or API errors. */
export async function fetchSubsonicXml(endpoint: string, params: Record<string, string | number | string[]> = {}, auth?: SubsonicAuth): Promise<Document> {
  if (!auth) await musicSessionReady();
  const response = await fetch(subsonicUrl(endpoint, params, auth));
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const text = await response.text();
  const xmlDoc = new DOMParser().parseFromString(text, 'application/xml');
  if (xmlDoc.querySelector('parsererror')) {
    throw new Error('Invalid XML response from server');
  }
  const root = xmlDoc.querySelector('subsonic-response');
  if (root?.getAttribute('status') === 'failed') {
    const message = xmlDoc.querySelector('error')?.getAttribute('message') || 'Unknown API error';
    throw new Error(`API Error: ${message}`);
  }
  return xmlDoc;
}

/** Fetch a Subsonic endpoint with f=json and return the subsonic-response object. Throws on HTTP or API errors. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchSubsonicJson(endpoint: string, params: Record<string, string | number | string[]> = {}, auth?: SubsonicAuth): Promise<any> {
  if (!auth) await musicSessionReady();
  const response = await fetch(subsonicUrl(endpoint, { ...params, f: 'json' }, auth));
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  const root = data?.['subsonic-response'];
  if (!root || root.status === 'failed') {
    throw new Error(`API Error: ${root?.error?.message || 'Unknown API error'}`);
  }
  return root;
}
