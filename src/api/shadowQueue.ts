/**
 * The outbox for shadow reports (see shadow.ts).
 *
 * A report is kept until the API answers 2xx, so an API outage or a closed
 * tab delays it rather than losing it. Reports are sent one at a time, oldest
 * first, and sending stops at the first failure: when the API cannot read a
 * document back it replays the patch, and a patch applied out of order could
 * store old values. A late report is otherwise safe, because read-back stores
 * Firestore's copy as it is when the report arrives.
 *
 * The queue lives in localStorage under one key per uid, because the API
 * attributes each report to the token's user. If storage is unavailable it
 * lives in memory for the life of the tab. Nothing here is ever shown to the
 * user: the Firestore write already succeeded, and the differ catches
 * anything that is lost.
 */

export type QueuedReport = { id: string; body: string };

/** Outcome of one attempt to deliver a report. */
type Delivery = 'delivered' | 'rejected' | 'retry';

export interface QueueDeps {
  /** The signed-in user's uid, or null when signed out. */
  currentUid(): string | null;
  /** An ID token for the current user; `refresh` forces a new one. */
  getToken(refresh: boolean): Promise<string>;
  fetch(url: string, init: RequestInit): Promise<Response>;
  storage(): Storage | null;
  setTimer(callback: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Runs `task` with no other tab doing the same, where the browser can. */
  exclusive(task: () => Promise<void>): Promise<void>;
  url: string;
}

export const MAX_REPORTS = 500;
export const MAX_BYTES = 1_000_000;
export const FIRST_BACKOFF_MS = 5_000;
export const MAX_BACKOFF_MS = 10 * 60_000;

/**
 * Browsers refuse a keepalive request whose body, together with every other
 * keepalive request still in flight, exceeds 64 KiB — the fetch rejects and
 * the report would wait for a retry. Large bodies (a long wiki page) go
 * without keepalive, which only matters if the tab closes in the same instant.
 */
const KEEPALIVE_MAX_BYTES = 60_000;

const keyFor = (uid: string) => `yabby.shadowOutbox.${uid}`;

export function createShadowQueue(deps: QueueDeps) {
  const memory = new Map<string, QueuedReport[]>();
  let flushing = false;
  let again = false;
  let timer: unknown = null;
  let backoff = FIRST_BACKOFF_MS;
  let counter = 0;

  function load(uid: string): QueuedReport[] {
    try {
      const storage = deps.storage();
      if (storage) {
        const raw = storage.getItem(keyFor(uid));
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? (parsed as QueuedReport[]) : [];
      }
    } catch {
      // Fall through to memory.
    }
    return memory.get(uid) ?? [];
  }

  function save(uid: string, reports: QueuedReport[]): void {
    try {
      const storage = deps.storage();
      if (storage) {
        if (reports.length) storage.setItem(keyFor(uid), JSON.stringify(reports));
        else storage.removeItem(keyFor(uid));
        return;
      }
    } catch {
      // Quota or a private window: keep it for this tab instead.
    }
    memory.set(uid, reports);
  }

  /** Oldest reports go first when the queue is over either limit. */
  function trim(reports: QueuedReport[]): QueuedReport[] {
    let bytes = reports.reduce((total, report) => total + report.body.length, 0);
    let dropped = 0;
    while (reports.length - dropped > 1 && (reports.length - dropped > MAX_REPORTS || bytes > MAX_BYTES)) {
      bytes -= reports[dropped].body.length;
      dropped += 1;
    }
    reports = reports.slice(dropped);
    if (dropped) console.warn(`[shadow] outbox full, dropped the ${dropped} oldest report(s)`);
    return reports;
  }

  async function attempt(report: QueuedReport, refresh: boolean): Promise<Response> {
    return deps.fetch(deps.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${await deps.getToken(refresh)}`,
      },
      body: report.body,
      keepalive: new TextEncoder().encode(report.body).length < KEEPALIVE_MAX_BYTES,
    });
  }

  async function deliver(report: QueuedReport): Promise<Delivery> {
    try {
      let response = await attempt(report, false);
      // A stale cached token is the usual 401; one forced refresh settles it.
      if (response.status === 401) response = await attempt(report, true);
      if (response.ok) return 'delivered';
      if (response.status === 401 || response.status >= 500) return 'retry';
      console.warn(`[shadow] report refused with ${response.status}, dropped`);
      return 'rejected';
    } catch {
      return 'retry';
    }
  }

  function schedule(): void {
    if (timer !== null) return;
    timer = deps.setTimer(() => {
      timer = null;
      void flush();
    }, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
  }

  async function drain(): Promise<void> {
    for (;;) {
      const uid = deps.currentUid();
      if (!uid) return;
      const [head] = load(uid);
      if (!head) return;

      const outcome = await deliver(head);
      if (outcome === 'retry') {
        schedule();
        return;
      }
      // Re-read: another call may have queued more while this one was out.
      save(uid, load(uid).filter((report) => report.id !== head.id));
      backoff = FIRST_BACKOFF_MS;
    }
  }

  /** Send whatever is queued for the signed-in user. Never throws. */
  async function flush(): Promise<void> {
    if (flushing) {
      again = true;
      return;
    }
    flushing = true;
    try {
      do {
        again = false;
        if (timer !== null) {
          deps.clearTimer(timer);
          timer = null;
        }
        await deps.exclusive(drain).catch(() => {});
      } while (again);
    } finally {
      flushing = false;
    }
  }

  /** Queue a report for the signed-in user and start sending. */
  function enqueue(body: string): void {
    const uid = deps.currentUid();
    if (!uid) return;
    counter += 1;
    const id = `${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
    save(uid, trim([...load(uid), { id, body }]));
    void flush();
  }

  return { enqueue, flush, pending: (uid: string) => load(uid).length };
}
