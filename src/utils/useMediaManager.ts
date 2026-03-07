import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

export const useMediaManager = (): { isMediaManager: boolean; loading: boolean } => {
  const [isMediaManager, setIsMediaManager] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkMediaManager = async () => {
      const user = auth.currentUser;
      if (!user) {
        setIsMediaManager(false);
        setLoading(false);
        return;
      }

      try {
        const mediaManagerDoc = await getDoc(doc(db, 'mediaManagers', user.uid));
        setIsMediaManager(mediaManagerDoc.exists());
      } catch (error) {
        console.error('Error checking media manager status:', error);
        setIsMediaManager(false);
      } finally {
        setLoading(false);
      }
    };

    checkMediaManager();
  }, []);

  return { isMediaManager, loading };
};
