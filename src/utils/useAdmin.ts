import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

export const useAdmin = (): { isAdmin: boolean; loading: boolean } => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      const user = auth.currentUser;
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      try {
        const adminDoc = await getDoc(doc(db, 'admins', user.uid));
        setIsAdmin(adminDoc.exists());
      } catch (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, []);

  return { isAdmin, loading };
};
