import { doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { trackedGetDoc } from './firestoreMetrics';

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

const cache = new Map<string, { username: string; avatar: string; timestamp: number }>();
const inFlight = new Map<string, Promise<{ username: string; avatar: string }>>();

/** Clear a specific user from the cache (e.g. after profile update) */
export function clearUserCache(userId: string): void {
  cache.delete(userId);
}

export async function getUserData(userId: string): Promise<{ username: string; avatar: string }> {
  const now = Date.now();
  const cached = cache.get(userId);

  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return { username: cached.username, avatar: cached.avatar };
  }

  // Deduplicate concurrent fetches for the same userId
  const pending = inFlight.get(userId);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const userDoc = await trackedGetDoc(doc(db, 'users', userId));
      const userData = userDoc.exists()
        ? { username: userDoc.data().username || 'Anonymous', avatar: userDoc.data().avatar || '' }
        : { username: 'Anonymous', avatar: '' };

      cache.set(userId, { ...userData, timestamp: Date.now() });
      return userData;
    } catch {
      const fallback = { username: 'Anonymous', avatar: '' };
      cache.set(userId, { ...fallback, timestamp: Date.now() });
      return fallback;
    } finally {
      inFlight.delete(userId);
    }
  })();

  inFlight.set(userId, promise);
  return promise;
}
