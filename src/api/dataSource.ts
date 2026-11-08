/**
 * Where each area reads from: the API's GET /api/data/source, fetched on
 * sign-in and whenever the tab comes back into view. Until the first answer,
 * and whenever the API cannot be reached, every area reads Firestore, so a
 * missing flag file or a dead API leaves the site as it always was. A failed
 * poll keeps the last value it had.
 *
 * In a dev build only, localStorage `yabby.dataSource.override`, for example
 * {"stickers":"sqlite"}, sits on top of the API's answer, so a page can be
 * compared against the API before anything is flipped.
 */

import { onAuthStateChanged } from 'firebase/auth';

import { auth } from '../firebaseConfig';
import { AREAS, type Area, type Source } from './areaClient';
import { apiRequest, READ_TIMEOUT_MS } from './http';

const OVERRIDE_KEY = 'yabby.dataSource.override';

const allFirestore = (): Record<Area, Source> =>
  Object.fromEntries(AREAS.map((area) => [area, 'firestore'])) as Record<Area, Source>;

let known: Record<Area, Source> = allFirestore();
let inFlight: Promise<void> | null = null;
let loadedFor: string | null = null;

function devOverride(): Partial<Record<Area, Source>> {
  if (!import.meta.env.DEV) return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Partial<Record<Area, Source>> = {};
    for (const area of AREAS) {
      const value = (parsed as Record<string, unknown>)[area];
      if (value === 'sqlite' || value === 'firestore') out[area] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Ask the API again. Never throws; a failure keeps what was known. */
export function refreshSources(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const uid = auth.currentUser?.uid ?? null;
    if (!uid) return;
    try {
      const body = await apiRequest<{ sources?: Record<string, unknown> }>('GET', '/source', { timeoutMs: READ_TIMEOUT_MS });
      const next = allFirestore();
      for (const area of AREAS) if (body?.sources?.[area] === 'sqlite') next[area] = 'sqlite';
      known = next;
    } catch {
      // Keep the last known value.
    }
    // Asked either way, so reads do not each wait on the flag while the API is
    // away. The next sign-in or return to the tab asks again.
    loadedFor = uid;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** The source for one area. Waits for the first answer after sign-in, which
 *  is bounded by the read timeout. */
export async function sourceFor(area: Area): Promise<Source> {
  const uid = auth.currentUser?.uid ?? null;
  if (uid && loadedFor !== uid) await refreshSources();
  return devOverride()[area] ?? known[area];
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    known = allFirestore();
    loadedFor = null;
    return;
  }
  void refreshSources();
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshSources();
  });
}
