import React, { useState, useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { getUserData } from '../utils/userCache';
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

interface RecentNewsProps {
  onLatestTimestamp?: (timestampMs: number | null) => void;
}

const RecentNews: React.FC<RecentNewsProps> = ({ onLatestTimestamp }) => {
  const [newsItem, setNewsItem] = useState<NewsItem | null>(null);
  const [loading, setLoading] = useState(true);

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '';
    try {
      return new Date(timestamp.seconds * 1000).toLocaleString();
    } catch {
      return '';
    }
  };

  // Fetch reaction count and current user status (one-time, no listener)
  const fetchReactionData = async (newsId: string) => {
    try {
      const reactionsSnap = await getDocs(collection(db, 'news', newsId, 'reactions'));
      const reactions = reactionsSnap.docs.map((d) => d.data() as Reaction);
      const reactionCount = reactions.length;
      const currentUserReacted = reactions.some(r => r.userId === auth.currentUser?.uid);

      setNewsItem((prev) => prev && prev.id === newsId ? {
        ...prev,
        reactions,
        reactionCount,
        currentUserReacted,
      } : prev);
    } catch (error) {
      console.error('Error fetching reactions:', error);
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
        onLatestTimestamp?.(null);
        return;
      }

      const docSnapshot = snapshot.docs[0];
      const data = docSnapshot.data();
      const userData = await getUserData(data.userId);

      // Report timestamp to parent for subtitle logic
      const ts = data.timestamp?.seconds ? data.timestamp.seconds * 1000 : null;
      onLatestTimestamp?.(ts);

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

      // Fetch reactions once (no real-time listener)
      fetchReactionData(docSnapshot.id);
    });

    return () => unsubscribe();
  }, []);

  const handleToggleReaction = async (newsId: string) => {
    if (!auth.currentUser) return;
    const reactionDocRef = doc(db, 'news', newsId, 'reactions', auth.currentUser.uid);
    try {
      const reactionDoc = await getDoc(reactionDocRef);
      if (reactionDoc.exists()) {
        // Optimistic update
        setNewsItem(prev => prev && prev.id === newsId ? {
          ...prev,
          reactionCount: Math.max(0, prev.reactionCount - 1),
          currentUserReacted: false,
        } : prev);
        await deleteDoc(reactionDocRef);
      } else {
        // Optimistic update
        setNewsItem(prev => prev && prev.id === newsId ? {
          ...prev,
          reactionCount: prev.reactionCount + 1,
          currentUserReacted: true,
        } : prev);
        const userData = await getUserData(auth.currentUser.uid);
        await setDoc(reactionDocRef, {
          userId: auth.currentUser.uid,
          username: userData.username,
          timestamp: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
      // Re-fetch to get correct state
      fetchReactionData(newsId);
    }
  };

  if (loading) {
    return <p className="normal-text">Loading news...</p>;
  }

  if (!newsItem) {
    return null;
  }

  const isFresh = newsItem.timestamp?.seconds
    ? Date.now() - newsItem.timestamp.seconds * 1000 < 24 * 60 * 60 * 1000
    : false;

  return (
    <div style={{ width: '100%', maxWidth: '600px', margin: '0 auto', padding: '0 16px', boxSizing: 'border-box', position: 'relative' }}>
      {isFresh && (
        <img
          src="/fresh.webp"
          alt="Fresh!"
          className="fresh-badge"
        />
      )}
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
