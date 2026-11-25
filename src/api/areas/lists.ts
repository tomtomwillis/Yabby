/**
 * List reads and writes. Reads go to the API when the flag says lists read
 * from SQLite, and to Firestore otherwise or on fallback. Writes go to the API
 * when the flag says so, and through the old Firestore writes when it does
 * not; a failed API write is an error, never retried on Firestore.
 *
 * The API routes are backend_server/routes/areas/lists.js. Each read pair
 * below must return the same documents in the same order
 * (backend_server/scripts/compare-lists.js checks this on a dump).
 */

import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore';

import { db } from '../../firebaseConfig';
import { trackedGetDoc, trackedGetDocs } from '../../utils/firestoreMetrics';
import { addDocShadowed, deleteDocShadowed, SERVER_TIME, updateDocShadowed, type WriteData } from '../shadow';
import { apiRequest, ApiError, readArea, writeArea } from '../client';
import { sourceFor } from '../dataSource';
import { docsFromSnapshot, docsFromWire, fromWire, type AreaDoc } from '../wire';
import type { ListItem } from '../../types/firestore';

const AREA = 'lists';
const lists = () => collection(db, 'lists');
const itemsOf = (listId: string) => collection(db, 'lists', listId, 'items');

// ---------------------------------------------------------------------------
// Reads. The list rule grants reads on isPublic == true or your own lists, and
// Firestore rejects a query the rule cannot verify from its filters, so public
// and own lists are separate queries.
// ---------------------------------------------------------------------------

/** Public lists, most recently updated first; all of them, or the newest `count`. */
export function publicListsByUpdate(count?: number): Promise<AreaDoc[]> {
  const suffix = count === undefined ? '' : `&limit=${count}`;
  return readArea(
    AREA,
    async () => docsFromWire(await apiRequest('GET', `/lists?scope=public&order=updated${suffix}`)),
    async () => {
      const ordered = query(lists(), where('isPublic', '==', true), orderBy('lastUpdated', 'desc'));
      return docsFromSnapshot(await trackedGetDocs(count === undefined ? ordered : query(ordered, limit(count))));
    },
  );
}

/** Every public list, in document id order. */
export function publicLists(): Promise<AreaDoc[]> {
  return readArea(
    AREA,
    async () => docsFromWire(await apiRequest('GET', '/lists?scope=public')),
    async () => docsFromSnapshot(await trackedGetDocs(query(lists(), where('isPublic', '==', true)))),
  );
}

/** The caller's own lists, private ones too, in document id order. No orderBy:
 *  ordering by a field leaves out documents that lack it. */
export function myLists(uid: string): Promise<AreaDoc[]> {
  return readArea(
    AREA,
    async () => docsFromWire(await apiRequest('GET', '/lists?scope=mine')),
    async () => docsFromSnapshot(await trackedGetDocs(query(lists(), where('userId', '==', uid)))),
  );
}

export interface ListWithItems {
  list: AreaDoc;
  items: AreaDoc[];
}

/** One list and its items in order, or null when it does not exist or the
 *  caller may not read it. */
export function getList(listId: string): Promise<ListWithItems | null> {
  return readArea(
    AREA,
    async () => {
      try {
        const body = await apiRequest<{ doc: { id: string; data: unknown }; items: unknown[] }>(
          'GET',
          `/lists/${encodeURIComponent(listId)}`,
        );
        return {
          list: { id: String(body.doc.id), data: fromWire(body.doc.data) as AreaDoc['data'] },
          items: docsFromWire({ docs: body.items }),
        };
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    async () => {
      const snap = await trackedGetDoc(doc(db, 'lists', listId));
      if (!snap.exists()) return null;
      const items = docsFromSnapshot(await trackedGetDocs(query(itemsOf(listId), orderBy('order', 'asc'))));
      return { list: { id: snap.id, data: snap.data() }, items };
    },
  );
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** An item as the editor holds it. `id` is set on an item loaded from the
 *  list, so a save keeps who added it. */
export type EditorItem = ListItem & { id?: string };

export interface ListPreview {
  lastItemImage: string;
  lastItemAlbumId: string;
  lastItemLink: string;
  lastItemAddedByAvatar: string;
}

export interface ListInput {
  title: string;
  isPublic: boolean;
  isCollaborative: boolean;
  items: EditorItem[];
  preview: ListPreview;
}

/** The rules' isWebLink: http(s), then at least one character, on one line. */
export function isListLink(url: string): boolean {
  return /^https?:\/\/[^\n]+$/.test(url);
}

/** A stored link the rules refuse (a list saved before links were checked may
 *  hold one) is dropped, so it cannot fail the whole save. The page never
 *  opens one anyway. */
function previewForWrite(preview: ListPreview): ListPreview {
  return { ...preview, lastItemLink: isListLink(preview.lastItemLink) ? preview.lastItemLink : '' };
}

/** The item fields the API takes. The server sets order, time and adder. */
function itemForApi(item: EditorItem): WriteData {
  const out: WriteData = { type: item.type, userText: item.userText };
  if (item.id) out.id = item.id;
  if (item.type === 'album') {
    out.albumId = item.albumId;
    out.albumTitle = item.albumTitle;
    out.albumArtist = item.albumArtist;
  } else {
    out.title = item.title;
    if (item.imageUrl?.trim()) out.imageUrl = item.imageUrl;
    if (item.linkUrl?.trim() && isListLink(item.linkUrl)) out.linkUrl = item.linkUrl;
  }
  return out;
}

/** The item as the old client wrote it to Firestore. */
function itemForFirestore(item: EditorItem): WriteData {
  const out: WriteData = {
    type: item.type,
    userText: item.userText,
    order: item.order,
    timestamp: SERVER_TIME,
    ...(item.addedByUserId && { addedByUserId: item.addedByUserId }),
    ...(item.addedByUsername && { addedByUsername: item.addedByUsername }),
    ...(item.addedByAvatar && { addedByAvatar: item.addedByAvatar }),
  };
  if (item.type === 'album') {
    out.albumId = item.albumId;
    out.albumTitle = item.albumTitle;
    out.albumArtist = item.albumArtist;
  } else {
    out.title = item.title;
    if (item.imageUrl?.trim()) out.imageUrl = item.imageUrl;
    if (item.linkUrl?.trim() && isListLink(item.linkUrl)) out.linkUrl = item.linkUrl;
  }
  return out;
}

/** Create a list. `username` is the caller's profile name, which the
 *  Firestore rules match; the API reads it from the profile itself. Returns
 *  the new list's id. */
export async function createList(uid: string, username: string, input: ListInput): Promise<string> {
  if ((await sourceFor(AREA)) === 'sqlite') {
    return writeArea(AREA, async () => {
      const body = await apiRequest<{ id: string }>('POST', '/lists', {
        body: {
          title: input.title,
          isPublic: input.isPublic,
          isCollaborative: input.isCollaborative,
          items: input.items.map(itemForApi),
          ...previewForWrite(input.preview),
        },
      });
      return body.id;
    });
  }

  const listRef = await addDocShadowed(lists(), {
    title: input.title,
    userId: uid,
    username,
    timestamp: SERVER_TIME,
    itemCount: input.items.length,
    isPublic: input.isPublic,
    isCollaborative: input.isCollaborative,
    lastUpdated: SERVER_TIME,
    ...previewForWrite(input.preview),
  });
  for (const item of input.items) await addDocShadowed(collection(listRef, 'items'), itemForFirestore(item));
  return listRef.id;
}

/** Save an existing list, replacing its items. A collaborator (not the owner)
 *  may not change isPublic or isCollaborative, so `asOwner` false leaves
 *  them out. */
export async function saveList(listId: string, input: ListInput, asOwner: boolean): Promise<void> {
  const flags = asOwner ? { isPublic: input.isPublic, isCollaborative: input.isCollaborative } : {};

  if ((await sourceFor(AREA)) === 'sqlite') {
    await writeArea(AREA, () =>
      apiRequest('PUT', `/lists/${encodeURIComponent(listId)}`, {
        body: { title: input.title, ...flags, items: input.items.map(itemForApi), ...previewForWrite(input.preview) },
      }),
    );
    return;
  }

  await updateDocShadowed(doc(db, 'lists', listId), {
    title: input.title,
    itemCount: input.items.length,
    ...flags,
    lastUpdated: SERVER_TIME,
    ...previewForWrite(input.preview),
  });
  const existing = await trackedGetDocs(query(itemsOf(listId)));
  for (const itemDoc of existing.docs) await deleteDocShadowed(itemDoc.ref);
  for (const item of input.items) await addDocShadowed(itemsOf(listId), itemForFirestore(item));
}

/** Delete a list and its items. Owner only. */
export async function deleteList(listId: string): Promise<void> {
  if ((await sourceFor(AREA)) === 'sqlite') {
    await writeArea(AREA, () => apiRequest('DELETE', `/lists/${encodeURIComponent(listId)}`));
    return;
  }

  const existing = await trackedGetDocs(query(itemsOf(listId)));
  for (const itemDoc of existing.docs) await deleteDocShadowed(itemDoc.ref);
  await deleteDocShadowed(doc(db, 'lists', listId));
}
