/**
 * Documents from the data API, turned back into what the Firestore SDK would
 * have handed a component. The API tags every timestamp {__t:'ts', ms}
 * (backend_server/data/wire.js); each becomes a Timestamp again, so components
 * keep calling .toDate() and reading .seconds.
 */

import { Timestamp, type DocumentData } from 'firebase/firestore';

/** One document: its id and its fields, as `{ id: d.id, data: d.data() }`. */
export interface AreaDoc<T = DocumentData> {
  id: string;
  data: T;
}

function isTaggedTimestamp(value: unknown): value is { __t: 'ts'; ms: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __t?: unknown }).__t === 'ts' &&
    typeof (value as { ms?: unknown }).ms === 'number'
  );
}

export function fromWire(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (isTaggedTimestamp(value)) return Timestamp.fromMillis(value.ms);
  if (Array.isArray(value)) return value.map(fromWire);
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) out[key] = fromWire(nested);
  return out;
}

/** The `docs` of an API answer, decoded. */
export function docsFromWire<T = DocumentData>(body: unknown): AreaDoc<T>[] {
  const docs = (body as { docs?: unknown })?.docs;
  if (!Array.isArray(docs)) throw new Error('The data API sent an unexpected answer.');
  return docs.map((doc: { id: string; data: unknown }) => ({ id: String(doc.id), data: fromWire(doc.data) as T }));
}

/** A Firestore query's documents in the same shape. */
export function docsFromSnapshot<T = DocumentData>(snapshot: { docs: { id: string; data(): DocumentData }[] }): AreaDoc<T>[] {
  return snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() as T }));
}
