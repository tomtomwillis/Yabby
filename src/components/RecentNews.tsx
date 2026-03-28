import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import NewsPost from './NewsPost';
import './MessageBoard.css';

interface Reaction {
  userId: string;
  username: string;
  timestamp: any;
}

interface NewsItem {
  id: string;
  text: string;
  userId: string;
  timestamp: any;
  username: string;
  avatar: string;
  editedAt?: any;
  reactions: Reaction[];
  reactionCount: number;
  currentUserReacted: boolean;
}

const RecentNews: React.FC = () => {
  const [newsItem, setNewsItem] = useState<NewsItem | null>(null);
  const [loading, setLoading] = useState(true);

  const userCacheRef = useRef<Map<string, { username: string; avatar: string; timestamp: number }>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000;

  const getUserData = async (userId: string): Promise<{ username: string; avatar: string }> => {
    const now = Date.now();
    const cached = userCacheRef.current.get(userId);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return { username: cached.username, avatar: cached.avatar };
    }
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      const userData = userDoc.exists()
        ? { username: userDoc.data().username || 'Anonymous', avatar: userDoc.data().avatar || '' }
        : { username: 'Anonymous', avatar: '' };
      userCacheRef.current.set(userId, { ...userData, timestamp: now });
      return userData;
    } catch {
      const fallback = { username: 'Anonymous', avatar: '' };
      userCacheRef.current.set(userId, { ...fallback, timestamp: now });
      return fallback;
    }
  };

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '';
    try {
      return new Date(timestamp.seconds * 1000).toLocaleString();
    } catch {
      return '';
    }
  };

  useEffect(() => {
    const q = query(
      collection(db, 'news'),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) {
        setNewsItem(null);
        setLoading(false);
        return;
      }

      const docSnapshot = snapshot.docs[0];
      const data = docSnapshot.data();
      const userData = await getUserData(data.userId);

      const item: NewsItem = {
        id: docSnapshot.id,
        text: data.text,
        userId: data.userId,
        timestamp: data.timestamp,
        username: userData.username,
        avatar: userData.avatar,
        editedAt: data.editedAt,
        reactions: [],
        reactionCount: 0,
        currentUserReacted: false,
      };

      setNewsItem(item);
      setLoading(false);

      // Listen for reactions
      const reactionsRef = collection(db, 'news', docSnapshot.id, 'reactions');
      onSnapshot(reactionsRef, (reactionsSnapshot) => {
        const reactions = reactionsSnapshot.docs.map((d) => d.data() as Reaction);
        setNewsItem((prev) => prev && prev.id === docSnapshot.id ? {
          ...prev,
          reactions,
          reactionCount: reactions.length,
          currentUserReacted: reactions.some(r => r.userId === auth.currentUser?.uid),
        } : prev);
      });
    });

    return () => unsubscribe();
  }, []);

  const handleToggleReaction = async (newsId: string) => {
    if (!auth.currentUser) return;
    const reactionDocRef = doc(db, 'news', newsId, 'reactions', auth.currentUser.uid);
    try {
      const reactionDoc = await getDoc(reactionDocRef);
      if (reactionDoc.exists()) {
        await deleteDoc(reactionDocRef);
      } else {
        const userData = await getUserData(auth.currentUser.uid);
        await setDoc(reactionDocRef, {
          userId: auth.currentUser.uid,
          username: userData.username,
          timestamp: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
    }
  };

  if (loading) {
    return <p className="normal-text">Loading news...</p>;
  }

  if (!newsItem) {
    return null;
  }

  return (
    <div style={{ width: '100%', maxWidth: '600px', margin: '0 auto', padding: '0 16px', boxSizing: 'border-box' }}>
      <NewsPost
        username={newsItem.username}
        message={newsItem.text}
        timestamp={formatTimestamp(newsItem.timestamp)}
        userSticker={newsItem.avatar || 'default-avatar.png'}
        userId={newsItem.userId}
        currentUserId={auth.currentUser?.uid}
        edited={!!newsItem.editedAt}
        truncate={true}
        truncateWords={25}
        reactions={newsItem.reactions}
        reactionCount={newsItem.reactionCount}
        currentUserReacted={newsItem.currentUserReacted}
        onToggleReaction={() => handleToggleReaction(newsItem.id)}
      />
    </div>
  );
};

export default RecentNews;
