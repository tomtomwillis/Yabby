/**
 * The member's own Navidrome account, linked once so the site plays as them
 * and phone apps sign in with a generated music password.
 * Served under /api/music/account by the backend's music routes.
 */

import { authedFetch } from './media';
import { ApiError } from './areaClient';

const ACCOUNT_URL = '/api/music/account';

export type MusicAccountStatus =
  | { enabled: false; linked?: false }
  /** Taken out of the rollout with a link still in place: it can only be undone. */
  | { enabled: false; linked: true }
  | { enabled: true; linked: false }
  | { enabled: true; linked: true; username: string; status: 'ok' | 'stale'; linkedAt: number; passwordSetAt: number };

export interface LinkedWithPassword {
  username: string;
  /** Shown once; the server does not hand it out again. */
  password: string;
  linkedAt: number;
  passwordSetAt: number;
}

export interface RegeneratedPassword {
  username: string;
  /** Shown once. */
  password: string;
  passwordSetAt: number;
}

const FALLBACKS: Record<number, string> = {
  429: 'Too many attempts. Wait a few minutes and try again.',
  502: "Couldn't reach the music server. Try again later.",
};

/** The JSON answer, or null for 204. A refusal throws ApiError with the
 *  server's own text for a 4xx, and a generic line otherwise. */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await authedFetch(`${ACCOUNT_URL}${path}`, {
      method,
      cache: 'no-store',
      ...(body !== undefined && {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
  } catch {
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
  }
  if (response.status === 204) return null as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error;
    const own = response.status < 500 && typeof message === 'string' && message ? message : null;
    throw new ApiError(response.status, own ?? FALLBACKS[response.status] ?? 'Something went wrong. Please try again.');
  }
  return data as T;
}

export function getMusicAccountStatus(): Promise<MusicAccountStatus> {
  return request<MusicAccountStatus>('GET', '');
}

/** Takes the member's current Navidrome login, which the new password replaces. */
export function linkMusicAccount(username: string, password: string): Promise<LinkedWithPassword> {
  return request<LinkedWithPassword>('POST', '/link', { username, password });
}

/** Also recovers a stale link. A 409 means neither saved password works and
 *  the link must be made again. */
export function regenerateMusicPassword(): Promise<RegeneratedPassword> {
  return request<RegeneratedPassword>('POST', '/password');
}

/** Navidrome itself is left as it is. A 409 means a password change is not yet
 *  confirmed, and unlinking now would lose it. */
export async function unlinkMusicAccount(): Promise<void> {
  await request<null>('DELETE', '');
}
