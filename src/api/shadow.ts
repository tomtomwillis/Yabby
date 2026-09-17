/**
 * Firestore writes that also report themselves to the Yabbyville API.
 *
 * Firestore stays authoritative. These wrappers write it exactly as the raw
 * SDK calls they replace, and then — separately, afterwards, and without
 * waiting — tell the API what was written so the SQLite shadow keeps up.
 *
 * **The shadow can never break a write.** Every report is fire-and-forget: no
 * caller awaits it, a failure is swallowed, and if the API is down or slow
 * posting behaves exactly as it did before any of this existed. That property
 * is worth more than the shadow itself, which is disposable and rebuildable
 * from a re-import.
 *
 * Outside the server's canary allowlist the endpoint returns 204 and does
 * nothing, so widening the canary is an environment change on the host rather
 * than a deploy.
 *
 * ## Use these markers, not the Firestore sentinels
 *
 * `serverTimestamp()`, `deleteField()`, `increment()`, `arrayUnion()` and
 * `arrayRemove()` all return the same opaque FieldValue, and the public API
 * gives no way to tell them apart — so a wrapper cannot inspect a patch and
 * work out what the caller meant. The markers below are translated in both
 * directions instead: into the real Firestore sentinel on the way to Firestore,
 * and into an operation the API resolves against its own copy on the way to the
 * shadow.
 *
 * This is not optional detail. The reaction toggle and the reply-count bump are
 * the two highest-volume writes in the app and both are transforms; sending
 * them literally would store a sentinel object instead of a count.
 *
 * It also keeps deletions honest. Removed fields travel to the API in their own
 * list rather than as nulls, because null is a real stored value here
 * (`posterPath`, `editedAt`) and conflating the two would delete data. The
 * wrapper builds that list itself, so no call site has to remember.
 */

import {
  arrayRemove,
  arrayUnion,
  deleteField,
  doc,
  increment,
  serverTimestamp,
  Timestamp,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';

// The tracked variants, not the raw SDK — every write in the app is counted
// against the Firestore budget by firestoreMetrics, and routing around it here
// would make the counter lie for exactly the writes this phase is adding.
import {
  trackedAddDoc,
  trackedDeleteDoc,
  trackedSetDoc,
  trackedUpdateDoc,
  trackedWriteBatch,
} from '../utils/firestoreMetrics';

import { auth } from '../firebaseConfig';

const DATA_API_URL = import.meta.env.VITE_DATA_API_URL || '/api/data';

/**
 * The wire form of a Firestore field transform. `__op` names match TRANSFORMS
 * in backend_server/data/shadow.js.
 */
type Transform =
  | { __op: 'serverTime' }
  | { __op: 'deleteField' }
  | { __op: 'increment'; by: number }
  | { __op: 'arrayUnion'; values: unknown[] }
  | { __op: 'arrayRemove'; values: unknown[] };

function isTransform(value: unknown): value is Transform {
  return typeof value === 'object' && value !== null && '__op' in value;
}

/** Stand-in for serverTimestamp(). The API substitutes its own clock, which is
 *  a host clock rather than whatever the browser believes. */
export const SERVER_TIME: Transform = { __op: 'serverTime' };

/** Stand-in for deleteField(). */
export const DELETE_FIELD: Transform = { __op: 'deleteField' };

/** Stand-in for increment(n). */
export const incrementBy = (by: number): Transform => ({ __op: 'increment', by });

/** Stand-in for arrayUnion(...values). */
export const arrayUnionOf = (...values: unknown[]): Transform => ({ __op: 'arrayUnion', values });

/** Stand-in for arrayRemove(...values). */
export const arrayRemoveOf = (...values: unknown[]): Transform => ({ __op: 'arrayRemove', values });

/** A field value, or one of the markers above. */
export type WriteData = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

function toSentinel(transform: Transform): unknown {
  switch (transform.__op) {
    case 'serverTime':
      return serverTimestamp();
    case 'deleteField':
      return deleteField();
    case 'increment':
      return increment(transform.by);
    case 'arrayUnion':
      return arrayUnion(...transform.values);
    case 'arrayRemove':
      return arrayRemove(...transform.values);
  }
}

/** The object handed to Firestore: markers become real FieldValue sentinels. */
function forFirestore(data: WriteData): DocumentData {
  const out: DocumentData = {};
  for (const [key, value] of Object.entries(data)) {
    out[key] = isTransform(value) ? toSentinel(value) : value;
  }
  return out;
}

/**
 * A Timestamp in the wire form the export uses, so mapping.js reads both the
 * same way. Left to JSON.stringify a Timestamp would arrive as
 * {seconds, nanoseconds} and a Date as an ISO string, neither of which the
 * server's coercions recognise.
 */
function tagValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return { __t: 'ts', ms: value.toMillis(), iso: value.toDate().toISOString() };
  }
  if (value instanceof Date) {
    return { __t: 'ts', ms: value.getTime(), iso: value.toISOString() };
  }
  if (Array.isArray(value)) return value.map(tagValue);
  if (value !== null && typeof value === 'object' && !isTransform(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) out[key] = tagValue(nested);
    return out;
  }
  return value;
}

/** The body sent to the API: transforms go over as-is for the server to resolve
 *  against its own copy, and deletions are split into their own list. */
function forShadow(data: WriteData): { data: DocumentData; remove: string[] } {
  const out: DocumentData = {};
  const remove: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (isTransform(value) && value.__op === 'deleteField') remove.push(key);
    else out[key] = tagValue(value);
  }

  return { data: out, remove };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** `set` is resolved by the API against what it holds — a create where
 *  nothing exists, an update where something does — because that is how
 *  Firestore picks the rule for setDoc, and the browser cannot know which. */
type ShadowOp = 'create' | 'set' | 'update' | 'delete';

type ReportOptions = { merge?: boolean };

/**
 * Tell the API what was written. Never throws, never awaited by a caller, and
 * deliberately does not force a token refresh — a cached token is fine for a
 * report that is allowed to fail, and forcing one would add a network round
 * trip to every write in the app.
 */
function send(
  op: ShadowOp,
  path: string,
  data: WriteData | null,
  firestoreOk: boolean,
  options: ReportOptions = {},
): void {
  void (async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const body: Record<string, unknown> = { op, path, firestoreOk };
      if (op === 'set') body.merge = options.merge === true;
      if (data) {
        const { data: payload, remove } = forShadow(data);
        body.data = payload;
        if (remove.length) body.remove = remove;
      }

      await fetch(`${DATA_API_URL}/shadow`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify(body),
        // Survives the tab closing straight after a post.
        keepalive: true,
      });
    } catch {
      // The Firestore write already succeeded, and reconcile.js repairs
      // whatever the shadow missed. Nothing here is worth a user-visible error.
    }
  })();
}

const report = (op: ShadowOp, path: string, data: WriteData | null, options?: ReportOptions) =>
  send(op, path, data, true, options);

/**
 * Report a write Firestore refused. The wrappers below call this themselves
 * when the rules answer permission-denied, so every denied write in the app —
 * including the deliberate ones the /test suites make — hands the API the one
 * piece of evidence it cannot get any other way. The policy port allowing
 * something Firestore denied is the divergence that matters most, and without
 * this the API only ever sees writes that succeeded.
 */
export function reportDenied(
  op: ShadowOp,
  path: string,
  data: WriteData | null,
  options?: ReportOptions,
): void {
  send(op, path, data, false, options);
}

/**
 * Report a write made outside the wrappers — a transaction, or anything else
 * that has to drive the SDK directly. The caller is responsible for having
 * written Firestore first and for describing the write exactly as made.
 */
export function reportWrite(
  op: ShadowOp,
  path: string,
  data: WriteData | null,
  options?: ReportOptions,
): void {
  report(op, path, data, options);
}

function isPermissionDenied(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'permission-denied';
}

// ---------------------------------------------------------------------------
// The wrappers
// ---------------------------------------------------------------------------

/** addDoc, with the new document reported once Firestore has assigned its id. */
export async function addDocShadowed(
  reference: CollectionReference,
  data: WriteData,
): Promise<DocumentReference> {
  let created: DocumentReference;
  try {
    created = await trackedAddDoc(reference, forFirestore(data));
  } catch (error) {
    // No id was assigned, so a fresh one stands in — the rules never depend
    // on the id of a document being created.
    if (isPermissionDenied(error)) reportDenied('create', doc(reference).path, data);
    throw error;
  }
  report('create', created.path, data);
  return created;
}

/** setDoc on a known id. `merge` is passed through to Firestore and to the
 *  API, which resolves the write against the document it holds. */
export async function setDocShadowed(
  reference: DocumentReference,
  data: WriteData,
  options?: { merge?: boolean },
): Promise<void> {
  try {
    await trackedSetDoc(reference, forFirestore(data), options);
  } catch (error) {
    if (isPermissionDenied(error)) reportDenied('set', reference.path, data, options);
    throw error;
  }
  report('set', reference.path, data, options);
}

/** updateDoc. The patch is reported as written — the API merges it onto the
 *  document it already holds, which is what Firestore evaluates too. */
export async function updateDocShadowed(
  reference: DocumentReference,
  data: WriteData,
): Promise<void> {
  try {
    await trackedUpdateDoc(reference, forFirestore(data));
  } catch (error) {
    if (isPermissionDenied(error)) reportDenied('update', reference.path, data);
    throw error;
  }
  report('update', reference.path, data);
}

/** deleteDoc. The API writes the whole document to the audit log before the
 *  row goes, so the record outlives the row. */
export async function deleteDocShadowed(reference: DocumentReference): Promise<void> {
  try {
    await trackedDeleteDoc(reference);
  } catch (error) {
    if (isPermissionDenied(error)) reportDenied('delete', reference.path, null);
    throw error;
  }
  report('delete', reference.path, null);
}

type BatchEntry = { op: ShadowOp; path: string; data: WriteData | null; options?: ReportOptions };

export interface ShadowedWriteBatch {
  set(reference: DocumentReference, data: WriteData, options?: { merge?: boolean }): ShadowedWriteBatch;
  update(reference: DocumentReference, data: WriteData): ShadowedWriteBatch;
  delete(reference: DocumentReference): ShadowedWriteBatch;
  commit(): Promise<void>;
}

/**
 * writeBatch. Each write is reported after the commit succeeds, in the order
 * it was queued — a batch is atomic in Firestore, so a denial means none of
 * them happened and all are reported as denied.
 */
export function writeBatchShadowed(firestore: Firestore): ShadowedWriteBatch {
  const batch = trackedWriteBatch(firestore);
  const entries: BatchEntry[] = [];

  const shadowed: ShadowedWriteBatch = {
    set(reference, data, options) {
      batch.set(reference, forFirestore(data), options ?? {});
      entries.push({ op: 'set', path: reference.path, data, options });
      return shadowed;
    },
    update(reference, data) {
      batch.update(reference, forFirestore(data));
      entries.push({ op: 'update', path: reference.path, data });
      return shadowed;
    },
    delete(reference) {
      batch.delete(reference);
      entries.push({ op: 'delete', path: reference.path, data: null });
      return shadowed;
    },
    async commit() {
      try {
        await batch.commitTracked();
      } catch (error) {
        if (isPermissionDenied(error)) {
          for (const entry of entries) reportDenied(entry.op, entry.path, entry.data, entry.options);
        }
        throw error;
      }
      for (const entry of entries) report(entry.op, entry.path, entry.data, entry.options);
    },
  };

  return shadowed;
}

/** Re-exported so a call site needs one import rather than two. */
export { doc };
