import type { User } from 'firebase/auth';
import { doc, increment, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { trackedGetDoc, trackedUpdateDoc } from './firestoreMetrics';

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/** The profile fields worth keeping — all of them come from the one users/{uid}
    read, so carrying bio and location costs nothing beyond what the username
    lookup already paid for. */
export interface UserProfile {
  username: string;
  /** False where the profile carries no name of its own and username above is
      standing in for one. Posts are rejected by the rules in that state, since
      the name on the post would not be the name on the profile. */
  hasUsername: boolean;
  avatar: string;
  bio: string;
  siteUrl: string;
  locationFlag: string;
  locationText: string;
  /** The account's creation time in Firebase Auth. Null for anyone with no
      profile document to carry it, and for bots, which were never created. */
  joinedAt: Date | null;
  postCount: number;
  nekoEnabled: boolean;
  designToolEnabled: boolean;
}

const EMPTY: UserProfile = {
  username: 'Anonymous',
  hasUsername: false,
  avatar: '',
  bio: '',
  siteUrl: '',
  locationFlag: '',
  locationText: '',
  joinedAt: null,
  postCount: 0,
  nekoEnabled: false,
  designToolEnabled: false,
};

type CacheEntry = UserProfile & { timestamp: number };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<UserProfile>>();

const STORAGE_KEY = 'yabbyville.userCache.v1';
const FLUSH_DELAY = 200;

/* Session storage rather than local: a profile that outlived the browser could
   show a stale username for days, where a tab's lifetime is a natural ceiling
   on how wrong it can get. CACHE_DURATION still applies on top, so the worst
   case is unchanged — this only stops a refresh re-reading every author on the
   page from Firestore.

   joinedAt is a Date, so it survives the round trip as an ISO string and is
   revived on the way back in. */
function hydrate(): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as Record<string, Omit<CacheEntry, 'joinedAt'> & { joinedAt: string | null }>;
    const now = Date.now();
    for (const [userId, entry] of Object.entries(stored)) {
      if (!entry || typeof entry.timestamp !== 'number') continue;
      if (now - entry.timestamp >= CACHE_DURATION) continue;
      cache.set(userId, { ...entry, joinedAt: entry.joinedAt ? new Date(entry.joinedAt) : null });
    }
  } catch {
    // Storage unavailable (private browsing), or a shape an older build wrote.
    // Either way the cache starts empty and refills itself.
  }
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  flushTimer = null;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    // Out of quota or no storage at all. Drop whatever is there rather than
    // leave a half-written entry behind; the in-memory cache is unaffected.
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing further to try.
    }
  }
}

/* Coalesced, because a board page resolves one profile per author and each
   would otherwise be its own synchronous write. Flushed on pagehide too — a
   refresh landing inside the debounce window is exactly the case this exists
   to serve. */
function persist(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flush, FLUSH_DELAY);
}

if (typeof window !== 'undefined') {
  hydrate();
  window.addEventListener('pagehide', () => {
    if (flushTimer !== null) clearTimeout(flushTimer);
    flush();
  });
}

/** Clear a specific user from the cache (e.g. after profile update) */
export function clearUserCache(userId: string): void {
  cache.delete(userId);
  persist();
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const now = Date.now();
  const cached = cache.get(userId);

  if (cached && now - cached.timestamp < CACHE_DURATION) {
    const { timestamp: _t, ...profile } = cached;
    return profile;
  }

  // Deduplicate concurrent fetches for the same userId
  const pending = inFlight.get(userId);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const userDoc = await trackedGetDoc(doc(db, 'users', userId));
      const data = userDoc.exists() ? userDoc.data() : null;
      const userData: UserProfile = data
        ? {
            username: data.username || 'Anonymous',
            hasUsername: typeof data.username === 'string' && data.username.trim().length > 0,
            avatar: data.avatar || '',
            bio: data.bio || '',
            siteUrl: data.siteUrl || '',
            locationFlag: data.locationFlag || '',
            locationText: data.locationText || '',
            joinedAt: data.joinedAt?.toDate?.() ?? null,
            postCount: typeof data.postCount === 'number' ? data.postCount : 0,
            nekoEnabled: data.nekoEnabled === true,
            designToolEnabled: data.designToolEnabled === true,
          }
        : EMPTY;

      cache.set(userId, { ...userData, timestamp: Date.now() });
      persist();
      return userData;
    } catch {
      cache.set(userId, { ...EMPTY, timestamp: Date.now() });
      persist();
      return EMPTY;
    } finally {
      inFlight.delete(userId);
    }
  })();

  inFlight.set(userId, promise);
  return promise;
}

export async function getUserData(
  userId: string,
): Promise<{ username: string; avatar: string; hasUsername: boolean }> {
  const { username, avatar, hasUsername } = await getUserProfile(userId);
  return { username, avatar, hasUsername };
}

/** Copies the account's Auth creation time onto the profile the first time
    someone signs in without one. Goes through the same cached profile read the
    board already does, so on a normal session it costs no extra reads; the
    write only ever happens once per account.
    Silent on failure: anyone who has not saved a profile has no users document
    to update, and the rules require a valid username on every write to one. */
export async function ensureJoinedAt(user: User): Promise<void> {
  const profile = await getUserProfile(user.uid);
  if (profile.joinedAt) return;

  const creationTime = user.metadata.creationTime;
  if (!creationTime) return;

  try {
    await trackedUpdateDoc(doc(db, 'users', user.uid), {
      joinedAt: Timestamp.fromDate(new Date(creationTime)),
    });
    clearUserCache(user.uid);
  } catch {
    // No profile document yet, or the write was rejected — either way there is
    // nothing to show in the gutter and nothing to retry.
  }
}

/** Advances the poster's tally by one. Fire-and-forget: a post that succeeded
    should not be reported as failed because its counter did not move. */
export async function bumpPostCount(userId: string): Promise<void> {
  try {
    await trackedUpdateDoc(doc(db, 'users', userId), { postCount: increment(1) });
    clearUserCache(userId);
  } catch (error) {
    console.error('Failed to update post count:', error);
  }
}
