import { md5 } from 'js-md5';

const SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
const API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
const API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
const CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID;

// Subsonic token auth (u + t + s): t = md5(password + salt). Keeps the
// plaintext password out of URLs — they end up in history, access logs and
// the DOM (cover-art img src). One salt per session is fine; the token is
// only valid with this salt.
const SALT = Math.random().toString(36).slice(2, 12);
const TOKEN = md5(`${API_PASSWORD}${SALT}`);

/** Base server URL, for non-API links like /app/#/album/... */
export const NAVIDROME_SERVER_URL: string = SERVER_URL;

/** Build an authenticated Subsonic REST URL. Params are URL-encoded. */
export function subsonicUrl(endpoint: string, params: Record<string, string | number> = {}): string {
  const search = new URLSearchParams({
    u: API_USERNAME,
    t: TOKEN,
    s: SALT,
    v: '1.16.1',
    c: CLIENT_ID,
  });
  for (const [key, value] of Object.entries(params)) {
    search.set(key, String(value));
  }
  return `${SERVER_URL}/rest/${endpoint}?${search.toString()}`;
}

/** Cover-art image URL for use in img src. */
export function coverArtUrl(coverArtId: string): string {
  return subsonicUrl('getCoverArt', { id: coverArtId });
}

/** Fetch a Subsonic endpoint and return the parsed XML document. Throws on HTTP, parse or API errors. */
export async function fetchSubsonicXml(endpoint: string, params: Record<string, string | number> = {}): Promise<Document> {
  const response = await fetch(subsonicUrl(endpoint, params));
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
export async function fetchSubsonicJson(endpoint: string, params: Record<string, string | number> = {}): Promise<any> {
  const response = await fetch(subsonicUrl(endpoint, { ...params, f: 'json' }));
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
