import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, doc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import {
  trackedGetDoc as getDoc,
  trackedGetDocs as getDocs,
  trackedSetDoc as setDoc,
  trackedDeleteDoc as deleteDoc,
} from '../utils/firestoreMetrics';
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

  useEffect(() => {
    let cancelled = false;

    const loadLatestNews = async () => {
      try {
        const q = query(
          collection(db, 'news'),
          orderBy('timestamp', 'desc'),
          limit(1),
        );
        const snapshot = await getDocs(q);

        if (cancelled) return;

        if (snapshot.empty) {
          setNewsItem(null);
          setLoading(false);
          onLatestTimestamp?.(null);
          return;
        }

        const docSnapshot = snapshot.docs[0];
        const data = docSnapshot.data();
        const userData = await getUserData(data.userId);

        if (cancelled) return;

        const ts = data.timestamp?.seconds ? data.timestamp.seconds * 1000 : null;
        onLatestTimestamp?.(ts);

        const reactionsSnap = await getDocs(collection(db, 'news', docSnapshot.id, 'reactions'));
        if (cancelled) return;

        const reactions = reactionsSnap.docs.map((d) => d.data() as Reaction);
        const currentUserId = auth.currentUser?.uid;

        setNewsItem({
          id: docSnapshot.id,
          text: data.text,
          userId: data.userId,
          timestamp: data.timestamp,
          username: userData.username,
          avatar: userData.avatar,
          editedAt: data.editedAt,
          reactions,
          reactionCount: reactions.length,
          currentUserReacted: !!currentUserId && reactions.some((r) => r.userId === currentUserId),
        });
        setLoading(false);
      } catch (error) {
        console.error('Error loading news:', error);
        if (!cancelled) setLoading(false);
      }
    };

    loadLatestNews();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleReaction = async (newsId: string) => {
    if (!auth.currentUser) return;
    const reactionDocRef = doc(db, 'news', newsId, 'reactions', auth.currentUser.uid);
    const alreadyReacted = !!newsItem?.currentUserReacted;

    // Optimistic update
    setNewsItem((prev) =>
      prev && prev.id === newsId
        ? {
            ...prev,
            reactionCount: alreadyReacted
              ? Math.max(0, prev.reactionCount - 1)
              : prev.reactionCount + 1,
            currentUserReacted: !alreadyReacted,
          }
        : prev,
    );

    try {
      if (alreadyReacted) {
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
      // Revert: verify current state against server
      try {
        const reactionDoc = await getDoc(reactionDocRef);
        const exists = reactionDoc.exists();
        setNewsItem((prev) =>
          prev && prev.id === newsId
            ? {
                ...prev,
                reactionCount: exists
                  ? (alreadyReacted ? prev.reactionCount + 1 : prev.reactionCount)
                  : (alreadyReacted ? prev.reactionCount : Math.max(0, prev.reactionCount - 1)),
                currentUserReacted: exists,
              }
            : prev,
        );
      } catch {
        /* give up silently */
      }
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
