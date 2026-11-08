/**
 * How a page reads and writes an area that may have moved off Firestore.
 * No browser or Firebase imports, so the rules here are tested on their own
 * (tests/area-client); client.ts wires them to the real world.
 *
 * Reads: when the flag says the area reads from SQLite, ask the API. On a
 * network error, a timeout or a 5xx, do that one read from Firestore instead
 * and count it. A 4xx is a real answer and is thrown, never covered up.
 *
 * Writes: there is no fallback. Writing Firestore while the area reads SQLite
 * would split the data, so a failed write is an error the member sees. A 409
 * means the flag changed under the page, so the flag is fetched again.
 */

export type Area = 'travel' | 'stickers';
export const AREAS: readonly Area[] = ['travel', 'stickers'];
export type Source = 'firestore' | 'sqlite';
export type FallbackReason = 'network' | 'timeout' | 'server';

/** An API answer that was not 2xx, or no answer at all (status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly reason: FallbackReason | null;

  constructor(status: number, message: string, reason: FallbackReason | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reason = reason;
  }
}

/** Why a failed API call should fall back, or null when it should not. */
export function fallbackReason(error: unknown): FallbackReason | null {
  if (!(error instanceof ApiError)) return 'network';
  if (error.reason) return error.reason;
  if (error.status >= 500) return 'server';
  return null;
}

export interface AreaClientDeps {
  sourceFor(area: Area): Promise<Source>;
  refreshSources(): Promise<void>;
  storage(): Storage | null;
  postFallbacks(counts: { area: Area; reason: FallbackReason; count: number }[]): Promise<void>;
  /** Called while a write is in flight, and again with false when it ends. */
  guardUnload(active: boolean): void;
  warn(message: string): void;
}

const FALLBACK_KEY = 'yabby.dataFallbacks';

export function createAreaClient(deps: AreaClientDeps) {
  let inFlightWrites = 0;
  let flushing = false;

  function loadCounts(): Record<string, number> {
    try {
      const raw = deps.storage()?.getItem(FALLBACK_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, number>) : {};
    } catch {
      return {};
    }
  }

  function saveCounts(counts: Record<string, number>): void {
    try {
      const storage = deps.storage();
      if (!storage) return;
      if (Object.keys(counts).length) storage.setItem(FALLBACK_KEY, JSON.stringify(counts));
      else storage.removeItem(FALLBACK_KEY);
    } catch {
      // Private window or quota: the count is lost, which only costs a log line.
    }
  }

  function countFallback(area: Area, reason: FallbackReason): void {
    const counts = loadCounts();
    const key = `${area}|${reason}`;
    counts[key] = (Number(counts[key]) || 0) + 1;
    saveCounts(counts);
  }

  /** Send the counts kept while the API was away. Call once it answers. */
  async function flushFallbacks(): Promise<void> {
    if (flushing) return;
    const counts = loadCounts();
    const entries = Object.entries(counts)
      .map(([key, count]) => {
        const [area, reason] = key.split('|') as [Area, FallbackReason];
        return { area, reason, count: Math.floor(Number(count)) };
      })
      .filter((entry) => AREAS.includes(entry.area) && entry.count > 0);
    if (!entries.length) {
      if (Object.keys(counts).length) saveCounts({});
      return;
    }
    flushing = true;
    try {
      await deps.postFallbacks(entries);
      // Counts added while the post was out stay for the next flush.
      const now = loadCounts();
      for (const { area, reason, count } of entries) {
        const key = `${area}|${reason}`;
        const left = (Number(now[key]) || 0) - count;
        if (left > 0) now[key] = left;
        else delete now[key];
      }
      saveCounts(now);
    } catch {
      // Kept for the next time the API answers.
    } finally {
      flushing = false;
    }
  }

  async function readArea<T>(area: Area, fromApi: () => Promise<T>, fromFirestore: () => Promise<T>): Promise<T> {
    if ((await deps.sourceFor(area)) !== 'sqlite') return fromFirestore();
    try {
      const result = await fromApi();
      void flushFallbacks();
      return result;
    } catch (error) {
      const reason = fallbackReason(error);
      if (!reason) throw error;
      deps.warn(`[data] ${area} read fell back to Firestore (${reason})`);
      countFallback(area, reason);
      return fromFirestore();
    }
  }

  /** Run one API write. Holds the close-tab guard while it is in flight. */
  async function writeArea<T>(area: Area, write: () => Promise<T>): Promise<T> {
    inFlightWrites += 1;
    if (inFlightWrites === 1) deps.guardUnload(true);
    try {
      return await write();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) void deps.refreshSources();
      throw error;
    } finally {
      inFlightWrites -= 1;
      if (inFlightWrites === 0) deps.guardUnload(false);
    }
  }

  return { readArea, writeArea, flushFallbacks, countFallback, pendingFallbacks: loadCounts };
}
