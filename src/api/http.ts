/**
 * One request to the data API (/api/data), signed with the member's token.
 * Every failure becomes an ApiError, so callers can tell "no answer" (status 0,
 * with a reason) from a real refusal.
 */

import { auth } from '../firebaseConfig';
import { ApiError } from './areaClient';

export const DATA_API_URL = import.meta.env.VITE_DATA_API_URL || '/api/data';

/** Reads give up after this and fall back. */
export const READ_TIMEOUT_MS = 3000;
const WRITE_TIMEOUT_MS = 15000;

/** Browsers refuse a keepalive body over 64 KiB in flight at once. */
const KEEPALIVE_MAX_BYTES = 60_000;

interface RequestOptions {
  body?: unknown;
  timeoutMs?: number;
}

async function send(method: string, path: string, options: RequestOptions, refreshToken: boolean): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new ApiError(401, 'You are not signed in.');
  const token = await user.getIdToken(refreshToken);

  const timeoutMs = options.timeoutMs ?? (method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  try {
    return await fetch(`${DATA_API_URL}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body,
      // A write survives the tab closing, where the browser allows it.
      keepalive: method !== 'GET' && (body === undefined || new TextEncoder().encode(body).length < KEEPALIVE_MAX_BYTES),
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) throw new ApiError(0, 'The server took too long to answer.', 'timeout');
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.", 'network');
  } finally {
    clearTimeout(timer);
  }
}

/** The parsed JSON answer, or null for 204. Throws ApiError otherwise. */
export async function apiRequest<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(method, path, options, false);
  // A stale cached token is the usual 401; one forced refresh settles it.
  if (response.status === 401) response = await send(method, path, options, true);

  if (response.status === 204) return null as T;
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (!response.ok) {
    const message = (parsed as { error?: unknown })?.error;
    throw new ApiError(response.status, typeof message === 'string' ? message : 'Something went wrong. Please try again.');
  }
  return parsed as T;
}
