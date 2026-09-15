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
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
} from 'firebase/firestore';

// The tracked variants, not the raw SDK — every write in the app is counted
// against the Firestore budget by firestoreMetrics, and routing around it here
// would make the counter lie for exactly the writes this phase is adding.
import {
  trackedAddDoc,
  trackedDeleteDoc,
  trackedSetDoc,
  trackedUpdateDoc,
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

/** The body sent to the API: transforms go over as-is for the server to resolve
 *  against its own copy, and deletions are split into their own list. */
function forShadow(data: WriteData): { data: DocumentData; remove: string[] } {
  const out: DocumentData = {};
  const remove: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (isTransform(value) && value.__op === 'deleteField') remove.push(key);
    else out[key] = value;
  }

  return { data: out, remove };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

type ShadowOp = 'create' | 'update' | 'delete';

/**
 * Tell the API what was written. Never throws, never awaited by a caller, and
 * deliberately does not force a token refresh — a cached token is fine for a
 * report that is allowed to fail, and forcing one would add a network round
 * trip to every write in the app.
 */
function send(op: ShadowOp, path: string, data: WriteData | null, firestoreOk: boolean): void {
  void (async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      const body: Record<string, unknown> = { op, path, firestoreOk };
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

const report = (op: ShadowOp, path: string, data: WriteData | null) => send(op, path, data, true);

/**
 * Report a write Firestore refused. Not called on the happy path — it exists so
 * a caller that catches a permission error can hand the API the one piece of
 * evidence it cannot get any other way: a write the rules denied. The policy
 * port allowing something Firestore denied is the divergence that matters most,
 * and without this the API only ever sees writes that succeeded.
 */
export function reportDenied(op: ShadowOp, path: string, data: WriteData | null): void {
  send(op, path, data, false);
}

// ---------------------------------------------------------------------------
// The wrappers
// ---------------------------------------------------------------------------

/** addDoc, with the new document reported once Firestore has assigned its id. */
export async function addDocShadowed(
  reference: CollectionReference,
  data: WriteData,
): Promise<DocumentReference> {
  const created = await trackedAddDoc(reference, forFirestore(data));
  report('create', created.path, data);
  return created;
}

/** setDoc on a known id. `merge` is passed through to Firestore; a merging
 *  write is reported as an update, since that is what it is. */
export async function setDocShadowed(
  reference: DocumentReference,
  data: WriteData,
  options?: { merge?: boolean },
): Promise<void> {
  await trackedSetDoc(reference, forFirestore(data), options);
  report(options?.merge ? 'update' : 'create', reference.path, data);
}

/** updateDoc. The patch is reported as written — the API merges it onto the
 *  document it already holds, which is what Firestore evaluates too. */
export async function updateDocShadowed(
  reference: DocumentReference,
  data: WriteData,
): Promise<void> {
  await trackedUpdateDoc(reference, forFirestore(data));
  report('update', reference.path, data);
}

/** deleteDoc. The API writes the whole document to the audit log before the
 *  row goes, so the record outlives the row. */
export async function deleteDocShadowed(reference: DocumentReference): Promise<void> {
  await trackedDeleteDoc(reference);
  report('delete', reference.path, null);
}

/** Re-exported so a call site needs one import rather than two. */
export { doc };
