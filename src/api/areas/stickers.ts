/**
 * Sticker reads and writes. Reads go to the API when the flag says stickers
 * read from SQLite, and to Firestore otherwise or on fallback. Writes go to
 * the API when the flag says so, and through the old Firestore batch when it
 * does not; a failed API write is an error, never retried on Firestore.
 *
 * The API routes are backend_server/routes/areas/stickers.js. Each read pair
 * below must return the same documents in the same order.
 */

import {
  collection,
  doc,
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
import { incrementBy, SERVER_TIME, writeBatchShadowed } from '../shadow';
import { apiRequest, readArea, writeArea } from '../client';
import { sourceFor } from '../dataSource';
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

/** Post a sticker. Returns its id. The owner's stickerCount moves with it. */
export async function createSticker(uid: string, input: NewSticker): Promise<string> {
  // Firestore refuses a field set to undefined, so an unchosen track is left out.
  const fields = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

  if ((await sourceFor(AREA)) === 'sqlite') {
    return writeArea(AREA, async () => {
      const body = await apiRequest<{ id: string }>('POST', '/stickers', { body: fields });
      return body.id;
    });
  }

  // One batch, so the profile's count can never drift from the stickers.
  const docRef = doc(stickers());
  await writeBatchShadowed(db)
    .set(docRef, { ...fields, userId: uid, timestamp: SERVER_TIME })
    .update(doc(db, 'users', uid), { stickerCount: incrementBy(1) })
    .commit();
  return docRef.id;
}

/** Delete a sticker. Its owner's stickerCount drops by one. */
export async function deleteSticker(stickerId: string, ownerId: string): Promise<void> {
  if ((await sourceFor(AREA)) === 'sqlite') {
    await writeArea(AREA, () => apiRequest('DELETE', `/stickers/${encodeURIComponent(stickerId)}`));
    return;
  }

  // An admin deleting someone else's sticker is let through by the profile's
  // admin stickerCount rule.
  await writeBatchShadowed(db)
    .delete(doc(db, 'stickers', stickerId))
    .update(doc(db, 'users', ownerId), { stickerCount: incrementBy(-1) })
    .commit();
}
