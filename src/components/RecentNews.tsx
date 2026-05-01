import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { trackedGetDocs as getDocs } from '../utils/firestoreMetrics';
import { getUserData } from '../utils/userCache';
import NewsPost from './NewsPost';
import './MessageBoard.css';

interface NewsItem {
  id: string;
  text: string;
  userId: string;
  timestamp: any;
  username: string;
  avatar: string;
  editedAt?: any;
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

        setNewsItem({
          id: docSnapshot.id,
          text: data.text,
          userId: data.userId,
          timestamp: data.timestamp,
          username: userData.username,
          avatar: userData.avatar,
          editedAt: data.editedAt,
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
      />
    </div>
  );
};

export default RecentNews;
