import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, query, orderBy, limit, startAfter, getDocs, onSnapshot, doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp, QueryDocumentSnapshot } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { sanitizeHtml } from '../utils/sanitise';
import { useAdmin } from '../utils/useAdmin';
import { useRateLimit } from '../utils/useRateLimit';
import Header from '../components/basic/Header';
import NewsPost from '../components/NewsPost';
import ForumBox from '../components/basic/ForumMessageBox';
import Button from '../components/basic/Button';
import '../components/MessageBoard.css';

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

const NEWS_PER_PAGE = 5;

const NewsPage: React.FC = () => {
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);

  const { isAdmin } = useAdmin();

  const { checkRateLimit } = useRateLimit({
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000,
  });

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

  const setupReactionListeners = (newsId: string) => {
    const reactionsRef = collection(db, 'news', newsId, 'reactions');
    return onSnapshot(reactionsRef, (snapshot) => {
      const reactions = snapshot.docs.map((d) => d.data() as Reaction);
      setNewsItems((prev) =>
        prev.map((item) =>
          item.id === newsId
            ? {
                ...item,
                reactions,
                reactionCount: reactions.length,
                currentUserReacted: reactions.some(r => r.userId === auth.currentUser?.uid),
              }
            : item
        )
      );
    });
  };

  useEffect(() => {
    const q = query(
      collection(db, 'news'),
      orderBy('timestamp', 'desc'),
      limit(NEWS_PER_PAGE)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.docs.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === NEWS_PER_PAGE);
      } else {
        setHasMore(false);
      }

      const items = await Promise.all(
        snapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data();
          const userData = await getUserData(data.userId);
          return {
            id: docSnapshot.id,
            text: data.text,
            userId: data.userId,
            timestamp: data.timestamp,
            username: userData.username,
            avatar: userData.avatar,
            editedAt: data.editedAt,
            reactions: [] as Reaction[],
            reactionCount: 0,
            currentUserReacted: false,
          };
        })
      );

      setNewsItems(items);
      setLoading(false);

      // Set up reaction listeners for initial items
      snapshot.docs.forEach((docSnapshot) => {
        setupReactionListeners(docSnapshot.id);
      });
    });

    return () => unsubscribe();
  }, []);

  const loadMore = async () => {
    if (!lastDoc || !hasMore || loadingMore) return;
    setLoadingMore(true);

    try {
      const q = query(
        collection(db, 'news'),
        orderBy('timestamp', 'desc'),
        startAfter(lastDoc),
        limit(NEWS_PER_PAGE)
      );

      const snapshot = await getDocs(q);

      if (snapshot.docs.length === 0) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }

      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === NEWS_PER_PAGE);

      const newItems = await Promise.all(
        snapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data();
          const userData = await getUserData(data.userId);
          return {
            id: docSnapshot.id,
            text: data.text,
            userId: data.userId,
            timestamp: data.timestamp,
            username: userData.username,
            avatar: userData.avatar,
            editedAt: data.editedAt,
            reactions: [] as Reaction[],
            reactionCount: 0,
            currentUserReacted: false,
          };
        })
      );

      // Set up reaction listeners for new items
      snapshot.docs.forEach((docSnapshot) => {
        setupReactionListeners(docSnapshot.id);
      });

      setNewsItems((prev) => [...prev, ...newItems]);
    } catch (error) {
      console.error('Error loading more news:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSendNews = async (text: string) => {
    if (!text.trim()) return;
    if (!auth.currentUser) {
      alert('You must be logged in to post news.');
      return;
    }

    if (!checkRateLimit()) {
      alert("You're posting too quickly! Please wait a few minutes.");
      return;
    }

    setSending(true);
    try {
      const sanitizedText = sanitizeHtml(text.trim());
      if (!sanitizedText.trim()) {
        alert('Your post contains invalid content. Please try again.');
        setSending(false);
        return;
      }

      const userData = await getUserData(auth.currentUser.uid);

      await addDoc(collection(db, 'news'), {
        text: sanitizedText,
        userId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        username: userData.username,
        avatar: userData.avatar,
      });
    } catch (error) {
      console.error('Error posting news:', error);
      alert('Failed to post news. Please try again.');
    } finally {
      setSending(false);
    }
  };

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

  const handleEditNews = async (newsId: string, newText: string) => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, 'news', newsId), {
        text: newText,
        editedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error editing news:', error);
      alert('Failed to edit news post. Please try again.');
    }
  };

  const handleDeleteNews = async (newsId: string) => {
    if (!auth.currentUser) return;
    try {
      await deleteDoc(doc(db, 'news', newsId));
    } catch (error) {
      console.error('Error deleting news:', error);
      alert('Failed to delete news post. Please try again.');
    }
  };

  return (
    <div className="app-container">
      <Header title="News" subtitle="Updates & Announcements" />

      <div className="message-board-container">
        {isAdmin && (
          <>
            <div style={{
              marginBottom: '16px',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '14px',
              color: 'var(--colour2)',
              fontStyle: 'italic',
              textAlign: 'center'
            }}>
              Post a news update for the community
            </div>
            <ForumBox
              onSend={handleSendNews}
              disabled={sending}
              placeholder="Write a news post..."
              maxWords={1000}
              maxChars={5000}
            />
          </>
        )}

        <div className="messages-container">
          {newsItems.map((item) => (
            <NewsPost
              key={item.id}
              username={item.username}
              message={item.text}
              timestamp={formatTimestamp(item.timestamp)}
              userSticker={item.avatar || 'default-avatar.png'}
              userId={item.userId}
              currentUserId={auth.currentUser?.uid}
              isAdmin={isAdmin}
              onEdit={(newText: string) => handleEditNews(item.id, newText)}
              onDelete={() => handleDeleteNews(item.id)}
              edited={!!item.editedAt}
              reactions={item.reactions}
              reactionCount={item.reactionCount}
              currentUserReacted={item.currentUserReacted}
              onToggleReaction={() => handleToggleReaction(item.id)}
            />
          ))}
        </div>

        {hasMore && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '20px',
            marginBottom: '20px'
          }}>
            <Button
              type="basic"
              label={loadingMore ? 'Loading...' : 'Show More'}
              onClick={loadMore}
              disabled={loadingMore}
            />
          </div>
        )}

        {!hasMore && newsItems.length > 0 && (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            color: 'var(--colour4)',
            fontStyle: 'italic'
          }}>
            No more news posts
          </div>
        )}

        {!loading && newsItems.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '20px',
            color: 'var(--colour4)',
            fontStyle: 'italic'
          }}>
            No news posts yet
          </div>
        )}
      </div>
    </div>
  );
};

export default NewsPage;
