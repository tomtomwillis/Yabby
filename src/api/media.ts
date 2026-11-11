/**
 * Requests to the media API (/api/media) and its neighbours, signed with the
 * member's token. The SDK keeps that token fresh by itself, so a request uses
 * the one it holds and asks for a new one only after a 401, rather than
 * paying a round trip to Google before every call.
 */

import { auth } from '../firebaseConfig';

export const MEDIA_API_URL: string = import.meta.env.VITE_MEDIA_API_URL || '/api/media';

/** fetch with the Authorization header added. The body is sent again after a
 *  401, so it must be a string, FormData or Blob rather than a stream. */
export async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  const send = async (refreshToken: boolean) => {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${await user.getIdToken(refreshToken)}`);
    return fetch(url, { ...init, headers });
  };

  const response = await send(false);
  return response.status === 401 ? send(true) : response;
}

/** The JSON answer to a signed request. A refusal throws the server's own
 *  `error` text where it sent one, and `fallback` where it did not. */
export async function authedJson<T = Record<string, unknown>>(
  url: string,
  fallback: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const response = await authedFetch(
    url,
    json === undefined
      ? rest
      : { ...rest, headers: { ...rest.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(json) },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : fallback);
  return data as T;
}

/** Upload one image to a media collection and return the id it was stored under. */
async function uploadImage(collection: string, file: File, fallback: string): Promise<string> {
  const body = new FormData();
  body.append('image', file);
  const data = await authedJson<{ imageId?: unknown }>(`${MEDIA_API_URL}/${collection}/upload`, fallback, {
    method: 'POST',
    body,
  });
  if (typeof data.imageId !== 'string') throw new Error(fallback);
  return data.imageId;
}

/** Message board images, which events and the wiki store alongside. */
export const uploadBoardImage = (file: File, fallback = 'Image upload failed') =>
  uploadImage('mb-images', file, fallback);

export const boardImageUrl = (imageId: string) => `${MEDIA_API_URL}/mb-images/${imageId}.webp`;

export const uploadTravelPhoto = (file: File) => uploadImage('travel-photos', file, 'Photo upload failed');
