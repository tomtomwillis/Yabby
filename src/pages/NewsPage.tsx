import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, startAfter, doc, serverTimestamp, QueryDocumentSnapshot } from 'firebase/firestore';
import {
  trackedGetDocs as getDocs,
  trackedOnSnapshot as onSnapshot,
  trackedAddDoc as addDoc,
  trackedUpdateDoc as updateDoc,
  trackedDeleteDoc as deleteDoc,
} from '../utils/firestoreMetrics';
import type { DocumentData } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { sanitizeHtml } from '../utils/sanitise';
import { useAdmin } from '../utils/useAdmin';
import { useRateLimit } from '../utils/useRateLimit';
import { getUserData } from '../utils/userCache';
import Header from '../components/basic/Header';
import NewsPost from '../components/NewsPost';
import BoardsRail from '../components/BoardsRail';
import ForumBox from '../components/basic/ForumMessageBox';
import Tips from '../components/basic/Tips';
import Button from '../components/basic/Button';
import '../components/MessageBoard.css';
import './MessageBoardPage.css';

interface NewsItem {
  id: string;
  text: string;
  userId: string;
  timestamp: any;
  username: string;
  avatar: string;
  editedAt?: any;
}

const NEWS_PER_PAGE = 5;

const tip: React.ComponentProps<typeof Tips> = {
  text: <><span className="mb-tip-mark">tip ▸</span> news posts ticked through to the message board are tagged there, and read here</>,
  showOnMobile: true,
  showOnDesktop: true,
};

const NewsPage: React.FC = () => {
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [crossPost, setCrossPost] = useState(false);

  const { isAdmin } = useAdmin();

  const { checkRateLimit } = useRateLimit({
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000,
  });

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
          };
        })
      );

      setNewsItems(items);
      setLoading(false);
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
          };
        })
      );

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

      const newsData: Record<string, any> = {
        text: sanitizedText,
        userId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        username: userData.username,
        avatar: userData.avatar,
      };
      // What the message board queries on to list this post alongside its own.
      if (crossPost) newsData.showOnMain = true;

      await addDoc(collection(db, 'news'), newsData);
      setCrossPost(false);
    } catch (error) {
      console.error('Error posting news:', error);
      alert('Failed to post news. Please try again.');
    } finally {
      setSending(false);
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
    <div className="app-container mb-board">
      <div className="mb-shell">
        <div className="mb-column">
          <Header title="News" subtitle="Updates & Announcements" />

          <Tips {...tip} />

          <div className="message-board-container">
            {isAdmin && (
              <ForumBox
                onSend={handleSendNews}
                disabled={sending}
                placeholder="Write a news post..."
                maxWords={1000}
                maxChars={5000}
                outsideControls={true}
                crossPost={{
                  label: 'also post to the message board',
                  checked: crossPost,
                  onChange: setCrossPost,
                }}
              />
            )}

            <div className="mb-board-bar">
              <span className="mb-board-bar-label">posts</span>
              <span className="mb-board-bar-rule" aria-hidden="true"></span>
              <span className="mb-board-bar-note">newest first</span>
            </div>

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
                  showPosterStats={true}
                  ledgerControls={true}
                  onEdit={(newText: string) => handleEditNews(item.id, newText)}
                  onDelete={() => handleDeleteNews(item.id)}
                  edited={!!item.editedAt}
                />
              ))}
            </div>

            {hasMore && (
              <div className="messages-more">
                <Button
                  type="basic"
                  label={loadingMore ? 'Loading...' : 'Show More'}
                  onClick={loadMore}
                  disabled={loadingMore}
                />
              </div>
            )}

            {!hasMore && newsItems.length > 0 && (
              <div className="messages-end">No more news posts</div>
            )}

            {!loading && newsItems.length === 0 && (
              <div className="messages-end">No news posts yet</div>
            )}
          </div>
        </div>

        <BoardsRail current="news" />
      </div>
    </div>
  );
};

export default NewsPage;
