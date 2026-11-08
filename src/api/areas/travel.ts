/**
 * Travel reads. Each function reads the API when the flag says
 * travel reads from SQLite, and Firestore otherwise or on fallback. Writes do
 * not move: they already go through /api/travel (utils/travelApi.ts).
 *
 * The API routes are backend_server/routes/areas/travel.js. Each pair below
 * must return the same documents in the same order.
 */

import { collection, limit, orderBy, query } from 'firebase/firestore';

import { db } from '../../firebaseConfig';
import { trackedGetDocs } from '../../utils/firestoreMetrics';
import { apiRequest, readArea } from '../client';
import { docsFromSnapshot, docsFromWire, type AreaDoc } from '../wire';

const AREA = 'travel';

/** Every place, in document id order. */
export function listPlaces(): Promise<AreaDoc[]> {
  return readArea(
    AREA,
    async () => docsFromWire(await apiRequest('GET', '/travel/places')),
    async () => docsFromSnapshot(await trackedGetDocs(collection(db, 'places'))),
  );
}

/** The `count` most recently active places. */
export function recentPlaces(count: number): Promise<AreaDoc[]> {
  return readArea(
    AREA,
    async () => docsFromWire(await apiRequest('GET', `/travel/places?order=recent&limit=${count}`)),
    async () =>
      docsFromSnapshot(await trackedGetDocs(query(collection(db, 'places'), orderBy('lastActivityAt', 'desc'), limit(count)))),
  );
}

/** Every contribution on one place, in uid order. */
export function placeContributions(placeId: string): Promise<AreaDoc[]> {
  return readArea(
    AREA,
    async () => docsFromWire(await apiRequest('GET', `/travel/places/${encodeURIComponent(placeId)}/contributions`)),
    async () => docsFromSnapshot(await trackedGetDocs(collection(db, 'places', placeId, 'contributions'))),
  );
}
