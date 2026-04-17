import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebaseConfig';

// Module-level cache to avoid redundant Firestore reads across component instances
const ADMIN_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
let adminCache: { uid: string; isAdmin: boolean; timestamp: number } | null = null;

export const useAdmin = (): { isAdmin: boolean; loading: boolean } => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Check module-level cache first
      if (adminCache && adminCache.uid === user.uid && Date.now() - adminCache.timestamp < ADMIN_CACHE_TTL) {
        setIsAdmin(adminCache.isAdmin);
        setLoading(false);
        return;
      }

      try {
        const adminDoc = await getDoc(doc(db, 'admins', user.uid));
        const result = adminDoc.exists();
        adminCache = { uid: user.uid, isAdmin: result, timestamp: Date.now() };
        setIsAdmin(result);
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  return { isAdmin, loading };
};
