import {
  getDoc as _getDoc,
  getDocs as _getDocs,
  onSnapshot as _onSnapshot,
  setDoc as _setDoc,
  addDoc as _addDoc,
  updateDoc as _updateDoc,
  deleteDoc as _deleteDoc,
  writeBatch as _writeBatch,
  type DocumentReference,
  type DocumentData,
  type Query,
  type QuerySnapshot,
  type DocumentSnapshot,
  type CollectionReference,
  type Firestore,
  type WriteBatch,
  type SetOptions,
} from 'firebase/firestore';

const ENABLED = import.meta.env.DEV;

type OpKind = 'getDoc' | 'getDocs' | 'onSnapshot' | 'setDoc' | 'addDoc' | 'updateDoc' | 'deleteDoc' | 'batchWrite';

interface Entry {
  op: OpKind;
  path: string;
  count: number;
  caller: string;
}

interface Session {
  label: string;
  start: number;
  entries: Entry[];
}

let current: Session | null = null;
const globalEntries: Entry[] = [];
const activeSnapshotLabels = new Set<string>();

function now(): number {
  return Date.now();
}

function record(entry: Entry): void {
  if (!ENABLED) return;
  globalEntries.push(entry);
  if (current) current.entries.push(entry);
}

function pathOf(refOrQuery: DocumentReference | CollectionReference | Query, fallback: string): string {
  const anyRef = refOrQuery as { path?: string; _query?: { path?: { canonicalString?: () => string } } };
  if (typeof anyRef.path === 'string') return anyRef.path;
  try {
    const qp = anyRef._query?.path?.canonicalString?.();
    if (qp) return qp;
  } catch {
    /* ignore */
  }
  return fallback;
}

function callerFrame(): string {
  const err = new Error();
  const stack = err.stack?.split('\n') ?? [];
  const frame = stack.find((l, i) => i > 2 && !l.includes('firestoreMetrics')) ?? '';
  const m = frame.match(/\((.+):(\d+):(\d+)\)/) ?? frame.match(/at (.+):(\d+):(\d+)/);
  return m ? `${m[1].split('/').slice(-2).join('/')}:${m[2]}` : '';
}

function summarise(entries: Entry[]): { rows: Array<{ op: string; path: string; count: number }>; reads: number; writes: number } {
  const key = (e: Entry) => `${e.op}|${e.path}`;
  const agg = new Map<string, { op: string; path: string; count: number }>();
  for (const e of entries) {
    const k = key(e);
    const cur = agg.get(k);
    if (cur) cur.count += e.count;
    else agg.set(k, { op: e.op, path: e.path, count: e.count });
  }
  const rows = Array.from(agg.values()).sort((a, b) => b.count - a.count);
  const reads = entries
    .filter((e) => e.op === 'getDoc' || e.op === 'getDocs' || e.op === 'onSnapshot')
    .reduce((s, e) => s + e.count, 0);
  const writes = entries
    .filter((e) => e.op === 'setDoc' || e.op === 'addDoc' || e.op === 'updateDoc' || e.op === 'deleteDoc' || e.op === 'batchWrite')
    .reduce((s, e) => s + e.count, 0);
  return { rows, reads, writes };
}

export const firestoreMetrics = {
  start(label: string): void {
    if (!ENABLED) return;
    if (current) {
      console.warn(`[metrics] overwriting active session "${current.label}" with "${label}"`);
    }
    current = { label, start: now(), entries: [] };
    console.log(`[metrics] start: ${label}`);
  },

  stop(): void {
    if (!ENABLED || !current) return;
    const s = current;
    current = null;
    const { rows, reads, writes } = summarise(s.entries);
    const elapsed = now() - s.start;
    console.log(`[metrics] stop: ${s.label} (${elapsed}ms) — reads=${reads} writes=${writes} activeListeners=${activeSnapshotLabels.size}`);
    if (rows.length) console.table(rows);
  },

  report(): void {
    if (!ENABLED) return;
    if (current) {
      const { rows, reads, writes } = summarise(current.entries);
      const elapsed = now() - current.start;
      console.log(`[metrics] report: ${current.label} (${elapsed}ms live) — reads=${reads} writes=${writes} activeListeners=${activeSnapshotLabels.size}`);
      if (rows.length) console.table(rows);
      return;
    }
    const { rows, reads, writes } = summarise(globalEntries);
    console.log(`[metrics] report: (no active session, showing all since load) — reads=${reads} writes=${writes} activeListeners=${activeSnapshotLabels.size}`);
    if (rows.length) console.table(rows);
  },

  reset(): void {
    globalEntries.length = 0;
    if (current) current.entries.length = 0;
    console.log('[metrics] reset');
  },

  activeListeners(): string[] {
    return Array.from(activeSnapshotLabels);
  },
};

if (ENABLED && typeof window !== 'undefined') {
  (window as unknown as { __firestoreMetrics: typeof firestoreMetrics }).__firestoreMetrics = firestoreMetrics;
}

export async function trackedGetDoc<T = DocumentData>(ref: DocumentReference<T>): Promise<DocumentSnapshot<T>> {
  const snap = await _getDoc(ref);
  record({ op: 'getDoc', path: pathOf(ref as unknown as DocumentReference, 'doc'), count: 1, caller: callerFrame() });
  return snap;
}

export async function trackedGetDocs<T = DocumentData>(q: Query<T>): Promise<QuerySnapshot<T>> {
  const snap = await _getDocs(q);
  record({ op: 'getDocs', path: pathOf(q as unknown as Query, 'query'), count: snap.size, caller: callerFrame() });
  return snap;
}

export function trackedOnSnapshot<T = DocumentData>(
  query: Query<T>,
  next: (snapshot: QuerySnapshot<T>) => void,
  error?: (err: Error) => void,
  complete?: () => void,
): () => void;
export function trackedOnSnapshot<T = DocumentData>(
  ref: DocumentReference<T>,
  next: (snapshot: DocumentSnapshot<T>) => void,
  error?: (err: Error) => void,
  complete?: () => void,
): () => void;
export function trackedOnSnapshot<T = DocumentData>(
  refOrQuery: Query<T> | DocumentReference<T>,
  next: ((snapshot: QuerySnapshot<T>) => void) | ((snapshot: DocumentSnapshot<T>) => void),
  error?: (err: Error) => void,
  complete?: () => void,
): () => void {
  const path = pathOf(refOrQuery as unknown as Query | DocumentReference, 'snapshot');
  const caller = callerFrame();
  const label = `${path}@${caller}`;
  activeSnapshotLabels.add(label);
  let first = true;
  const unsubscribe = _onSnapshot(
    refOrQuery as Query<T>,
    (snap: QuerySnapshot<T>) => {
      const count = typeof (snap as unknown as { size?: number })?.size === 'number'
        ? (first ? snap.size : snap.docChanges().length)
        : 1;
      first = false;
      record({ op: 'onSnapshot', path, count, caller });
      (next as (s: QuerySnapshot<T>) => void)(snap);
    },
    error,
    complete,
  );
  return () => {
    activeSnapshotLabels.delete(label);
    unsubscribe();
  };
}

export async function trackedSetDoc(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref: DocumentReference<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  options?: SetOptions,
): Promise<void> {
  await (options ? _setDoc(ref, data, options) : _setDoc(ref, data));
  record({ op: 'setDoc', path: pathOf(ref as unknown as DocumentReference, 'doc'), count: 1, caller: callerFrame() });
}

export async function trackedAddDoc(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref: CollectionReference<any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
): Promise<DocumentReference> {
  const result = await _addDoc(ref, data);
  record({ op: 'addDoc', path: pathOf(ref as unknown as CollectionReference, 'collection'), count: 1, caller: callerFrame() });
  return result as DocumentReference;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function trackedUpdateDoc(ref: DocumentReference, data: any): Promise<void> {
  await _updateDoc(ref, data);
  record({ op: 'updateDoc', path: pathOf(ref as unknown as DocumentReference, 'doc'), count: 1, caller: callerFrame() });
}

export async function trackedDeleteDoc(ref: DocumentReference): Promise<void> {
  await _deleteDoc(ref);
  record({ op: 'deleteDoc', path: pathOf(ref as unknown as DocumentReference, 'doc'), count: 1, caller: callerFrame() });
}

export function trackedWriteBatch(firestore: Firestore): WriteBatch & { commitTracked: () => Promise<void> } {
  const batch = _writeBatch(firestore);
  let ops = 0;
  const origSet = batch.set.bind(batch);
  const origUpdate = batch.update.bind(batch);
  const origDelete = batch.delete.bind(batch);
  batch.set = ((...args: Parameters<typeof origSet>) => {
    ops++;
    return origSet(...args);
  }) as typeof batch.set;
  batch.update = ((...args: Parameters<typeof origUpdate>) => {
    ops++;
    return origUpdate(...args);
  }) as typeof batch.update;
  batch.delete = ((ref) => {
    ops++;
    return origDelete(ref);
  }) as typeof batch.delete;
  const tracked = batch as WriteBatch & { commitTracked: () => Promise<void> };
  const caller = callerFrame();
  tracked.commitTracked = async () => {
    await batch.commit();
    record({ op: 'batchWrite', path: 'batch', count: ops, caller });
  };
  return tracked;
}
