import { useState, useEffect } from 'react';
import { doc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebaseConfig';
import { trackedGetDoc } from './firestoreMetrics';

const ROLE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

const cache = new Map<string, { granted: boolean; timestamp: number }>();
/** Concurrent mounts must share one read — the nav renders in both the header
    and the home index, so without this every shell mount pays twice. */
const inFlight = new Map<string, Promise<boolean>>();

async function hasRole(collectionName: string, uid: string): Promise<boolean> {
  const key = `${collectionName}:${uid}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ROLE_CACHE_TTL) return cached.granted;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const snap = await trackedGetDoc(doc(db, collectionName, uid));
      const granted = snap.exists();
      cache.set(key, { granted, timestamp: Date.now() });
      return granted;
    } catch (error) {
      console.error(`Error checking ${collectionName} status:`, error);
      return false;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/** Membership of a role collection whose documents are keyed by uid, where
 *  existence is the grant. Cached across component instances and deduplicated
 *  across simultaneous mounts. */
export function useRoleFlag(collectionName: string): { granted: boolean; loading: boolean } {
  const [granted, setGranted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        if (!cancelled) {
          setGranted(false);
          setLoading(false);
        }
        return;
      }
      const result = await hasRole(collectionName, user.uid);
      if (cancelled) return;
      setGranted(result);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [collectionName]);

  return { granted, loading };
}
