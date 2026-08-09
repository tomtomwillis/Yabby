import { doc, increment, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { trackedGetDoc, trackedUpdateDoc } from './firestoreMetrics';

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/** The profile fields worth keeping — all of them come from the one users/{uid}
    read, so carrying bio and location costs nothing beyond what the username
    lookup already paid for. */
export interface UserProfile {
  username: string;
  avatar: string;
  bio: string;
  siteUrl: string;
  locationFlag: string;
  locationText: string;
  /** Null for anyone who has not logged in since join dates were introduced. */
  joinedAt: Date | null;
  postCount: number;
}

const EMPTY: UserProfile = {
  username: 'Anonymous',
  avatar: '',
  bio: '',
  siteUrl: '',
  locationFlag: '',
  locationText: '',
  joinedAt: null,
  postCount: 0,
};

const cache = new Map<string, UserProfile & { timestamp: number }>();
const inFlight = new Map<string, Promise<UserProfile>>();

/** Clear a specific user from the cache (e.g. after profile update) */
export function clearUserCache(userId: string): void {
  cache.delete(userId);
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
            avatar: data.avatar || '',
            bio: data.bio || '',
            siteUrl: data.siteUrl || '',
            locationFlag: data.locationFlag || '',
            locationText: data.locationText || '',
            joinedAt: data.joinedAt?.toDate?.() ?? null,
            postCount: typeof data.postCount === 'number' ? data.postCount : 0,
          }
        : EMPTY;

      cache.set(userId, { ...userData, timestamp: Date.now() });
      return userData;
    } catch {
      cache.set(userId, { ...EMPTY, timestamp: Date.now() });
      return EMPTY;
    } finally {
      inFlight.delete(userId);
    }
  })();

  inFlight.set(userId, promise);
  return promise;
}

export async function getUserData(userId: string): Promise<{ username: string; avatar: string }> {
  const { username, avatar } = await getUserProfile(userId);
  return { username, avatar };
}

/** Stamps a join date the first time someone signs in without one. Goes through
    the same cached profile read the board already does, so on a normal session
    it costs no extra reads; the write only ever happens once per account.
    Silent on failure: anyone who has not saved a profile has no users document
    to update, and the rules require a valid username on every write to one. */
export async function ensureJoinedAt(userId: string): Promise<void> {
  const profile = await getUserProfile(userId);
  if (profile.joinedAt) return;

  try {
    await trackedUpdateDoc(doc(db, 'users', userId), { joinedAt: serverTimestamp() });
    clearUserCache(userId);
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
