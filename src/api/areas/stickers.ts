/**
 * Sticker reads and writes. Reads go to the API when the flag says stickers
 * read from SQLite, and to Firestore otherwise or on fallback. Writes always go
 * to the API: the rules refuse browser writes to live stickers, so a failed
 * API write is an error, never retried on Firestore.
 *
 * The API routes are backend_server/routes/areas/stickers.js. Each read pair
 * below must return the same documents in the same order.
 */

import {
  collection,
  documentId,
  endBefore,
  limit,
  orderBy,
  query,
  startAt,
  where,
} from 'firebase/firestore';

import { db } from '../../firebaseConfig';
import { trackedGetDocs } from '../../utils/firestoreMetrics';
import { apiRequest, readArea, writeArea } from '../client';
import { docsFromSnapshot, docsFromWire, type AreaDoc } from '../wire';

const AREA = 'stickers';
const stickers = () => collection(db, 'stickers');

/** Firestore's `in` takes at most 30 values; the API takes the same. */
export const MAX_ALBUMS_PER_QUERY = 30;

/** Every sticker, in document id order. */
export function allStickers(): Promise<AreaDoc[]> {
  return readArea(
    AREA,
    async () => docsFromWire(await apiRequest('GET', '/stickers')),
    async () => docsFromSnapshot(await trackedGetDocs(stickers())),
  );
}

/** Newest first; every sticker, or the newest `count`. */
export function recentStickers(count?: number): Promise<AreaDoc[]> {
  const suffix = count === undefined ? '' : `&limit=${count}`;
  return readArea(
    AREA,
    async () => docsFromWire(await apiRequest('GET', `/stickers?order=recent${suffix}`)),
    async () => {
      const ordered = query(stickers(), orderBy('timestamp', 'desc'));
      return docsFromSnapshot(await trackedGetDocs(count === undefined ? ordered : query(ordered, limit(count))));
    },
  );
}

/** Firestore's auto-ID alphabet. A key drawn from it lands uniformly among the
 *  existing document IDs, so a window starting there is a random slice of the
 *  collection — no extra field, no extra reads, no index. */
const AUTO_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomDocId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => AUTO_ID_CHARS[b % AUTO_ID_CHARS.length]).join('');
}

/** About `count` stickers, at random. */
export function randomStickers(count: number): Promise<AreaDoc[]> {
  return readArea(
    AREA,
    async () => docsFromWire(await apiRequest('GET', `/stickers?order=random&limit=${count}`)),
    async () => {
      const from = randomDocId();
      const scanned = docsFromSnapshot(
        await trackedGetDocs(query(stickers(), orderBy(documentId()), startAt(from), limit(count))),
      );
      // The window runs off the end of the collection when the random key
      // lands near it, so wrap back round to the start for the shortfall.
      if (scanned.length >= count) return scanned;
      const wrapped = docsFromSnapshot(
        await trackedGetDocs(query(stickers(), orderBy(documentId()), endBefore(from), limit(count - scanned.length))),
      );
      return [...scanned, ...wrapped];
    },
  );
}

/** Every sticker on these albums (at most MAX_ALBUMS_PER_QUERY). */
export function stickersOnAlbums(albumIds: string[]): Promise<AreaDoc[]> {
  if (albumIds.length === 0) return Promise.resolve([]);
  if (albumIds.length > MAX_ALBUMS_PER_QUERY) throw new Error(`At most ${MAX_ALBUMS_PER_QUERY} albums per query.`);
  return readArea(
    AREA,
    async () => docsFromWire(await apiRequest('GET', `/stickers?albums=${albumIds.map(encodeURIComponent).join(',')}`)),
    async () =>
      docsFromSnapshot(
        await trackedGetDocs(
          albumIds.length === 1
            ? query(stickers(), where('albumId', '==', albumIds[0]))
            : query(stickers(), where('albumId', 'in', albumIds)),
        ),
      ),
  );
}

export interface NewSticker {
  albumId: string;
  albumName?: string;
  albumArtist?: string;
  text: string;
  position: { x: number; y: number };
  sticker: string;
  favoriteTrackId?: string;
  favoriteTrackTitle?: string;
}

/** Post a sticker. Returns its id. The server moves the owner's stickerCount. */
export async function createSticker(input: NewSticker): Promise<string> {
  // An unchosen track is left out rather than sent as undefined.
  const fields = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  return writeArea(AREA, async () => {
    const body = await apiRequest<{ id: string }>('POST', '/stickers', { body: fields });
    return body.id;
  });
}

/** Delete a sticker. The server drops its owner's stickerCount. */
export async function deleteSticker(stickerId: string): Promise<void> {
  await writeArea(AREA, () => apiRequest('DELETE', `/stickers/${encodeURIComponent(stickerId)}`));
}
