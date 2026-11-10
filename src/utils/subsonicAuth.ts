import { md5 } from 'js-md5';
import type { SubsonicAuth } from './navidrome';

// Subsonic token auth (u + t + s): t = md5(password + salt). Keeps the
// plaintext password out of URLs — they end up in history, access logs and
// the DOM (cover-art img src). One salt per session is fine; the token is
// only valid with this salt.
export function createSubsonicAuth(username: string, password: string): SubsonicAuth {
  const salt = Math.random().toString(36).slice(2, 12);
  return { u: username, t: md5(`${password}${salt}`), s: salt };
}
