import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  doc,
  serverTimestamp,
  limit,
  startAfter,
  increment,
  runTransaction,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  trackedGetDoc as getDoc,
  trackedGetDocs as getDocs,
  trackedAddDoc as addDoc,
  trackedUpdateDoc as updateDoc,
  trackedDeleteDoc as deleteDoc,
} from '../utils/firestoreMetrics';
import type { DocumentData } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { sanitizeHtml } from '../utils/sanitise';
import UserMessage from './basic/UserMessages';
import './MessageBoard.css';
import ForumBox from './basic/ForumMessageBox';
import Button from './basic/Button';
import { useRateLimit } from '../utils/useRateLimit';
import { useAdmin } from '../utils/useAdmin';
import { getUserData } from '../utils/userCache';
import { getCurrentMonthId, getPrevMonthId } from '../utils/useFilmClub';

interface Reaction {
  userId: string;
  username: string;
  timestamp: any;
}

interface Reply {
  id: string;
  text: string;
  userId: string;
  timestamp: any;
  username: string;
  avatar: string;
  reactions?: Reaction[];
  reactionCount?: number;
  currentUserReacted?: boolean;
  editedAt?: any;
  imageId?: string;
}

interface Message {
  id: string;
  text: string;
  userId: string;
  timestamp: any;
  lastActivityAt?: any;
  username: string;
  avatar: string;
  reactions?: Reaction[];
  reactionCount?: number;
  currentUserReacted?: boolean;
  replies?: Reply[];
  replyCount?: number;
  repliesLoaded?: boolean;
  editedAt?: any;
  imageId?: string;
  posterUrl?: string;
}

interface MessageBoardProps {
  enableReactions?: boolean;
  enableReplies?: boolean;
  collectionName?: string;
}

const MESSAGES_PER_PAGE = 20;
const MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL || '/api/media';

async function uploadMessageImage(file: File): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const idToken = await user.getIdToken(true);

  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${MEDIA_API_URL}/mb-images/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Image upload failed');
  }

  const data = await response.json();
  return data.imageId;
}

function sortByBump(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    const aTime = (a.lastActivityAt ?? a.timestamp)?.seconds ?? 0;
    const bTime = (b.lastActivityAt ?? b.timestamp)?.seconds ?? 0;
    return bTime - aTime;
  });
}

function mapMessageDoc(docSnap: QueryDocumentSnapshot<DocumentData>): Message {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    text: data.text,
    userId: data.userId,
    timestamp: data.timestamp,
    lastActivityAt: data.lastActivityAt,
    username: data.username || 'Anonymous',
    avatar: data.avatar || '',
    reactionCount: typeof data.reactionCount === 'number' ? data.reactionCount : 0,
    replyCount: typeof data.replyCount === 'number' ? data.replyCount : 0,
    currentUserReacted: false,
    editedAt: data.editedAt,
    imageId: data.imageId || undefined,
    posterUrl: data.posterUrl || undefined,
  };
}

function mapReplyDoc(docSnap: QueryDocumentSnapshot<DocumentData>): Reply {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    text: data.text,
    userId: data.userId,
    timestamp: data.timestamp,
    username: data.username || 'Anonymous',
    avatar: data.avatar || '',
    reactionCount: typeof data.reactionCount === 'number' ? data.reactionCount : 0,
    currentUserReacted: false,
    editedAt: data.editedAt,
    imageId: data.imageId,
  };
}

const MessageBoard: React.FC<MessageBoardProps> = ({ enableReactions = false, enableReplies = false, collectionName = 'messages' }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);

  // Listener cleanup refs
  const messagesUnsubRef = useRef<(() => void) | null>(null);
  const replyUnsubsRef = useRef<Map<string, () => void>>(new Map());

  const { isAdmin } = useAdmin();
  const { checkRateLimit } = useRateLimit({ maxAttempts: 10, windowMs: 5 * 60 * 1000 });

  // Tracks which message/reply reactor lists have been fetched (for hover tooltip).
  const fetchedReactionsRef = useRef<Set<string>>(new Set());
  const fetchedReplyReactionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    loadInitialMessages();
    // No listeners — nothing to clean up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableReactions, enableReplies]);

  // Fetch currentUserReacted for each message in parallel (1 read per message).
  // Doc ID in messages/{id}/reactions/{uid} is the uid — getDoc is a direct point-read.
  const hydrateUserReactions = useCallback(async (messageIds: string[]) => {
    if (!enableReactions) return;
    const uid = auth.currentUser?.uid;
    if (!uid || messageIds.length === 0) return;
    try {
      const results = await Promise.all(
        messageIds.map(async (id) => {
          const snap = await getDoc(doc(db, collectionName, id, 'reactions', uid));
          return { id, reacted: snap.exists() };
        }),
      );
      const reactedMap = new Map(results.map((r) => [r.id, r.reacted]));
      setMessages((prev) =>
        prev.map((m) =>
          reactedMap.has(m.id) ? { ...m, currentUserReacted: reactedMap.get(m.id)! } : m,
        ),
      );
    } catch (error) {
      console.error('Error hydrating user reactions:', error);
    }
  }, [enableReactions, collectionName]);

  // Same pattern for replies of a single message.
  const hydrateUserReplyReactions = useCallback(async (messageId: string, replyIds: string[]) => {
    if (!enableReactions) return;
    const uid = auth.currentUser?.uid;
    if (!uid || replyIds.length === 0) return;
    try {
      const results = await Promise.all(
        replyIds.map(async (rid) => {
          const snap = await getDoc(doc(db, collectionName, messageId, 'replies', rid, 'reactions', uid));
          return { rid, reacted: snap.exists() };
        }),
      );
      const reactedMap = new Map(results.map((r) => [r.rid, r.reacted]));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                replies: m.replies?.map((r) =>
                  reactedMap.has(r.id) ? { ...r, currentUserReacted: reactedMap.get(r.id)! } : r,
                ),
              }
            : m,
        ),
      );
    } catch (error) {
      console.error('Error hydrating reply reactions:', error);
    }
  }, [enableReactions, collectionName]);

  const loadInitialMessages = async () => {
    try {
      const q = query(
        collection(db, collectionName),
        orderBy('lastActivityAt', 'desc'),
        limit(MESSAGES_PER_PAGE),
      );
      const snapshot = await getDocs(q);

      if (snapshot.docs.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === MESSAGES_PER_PAGE);
      } else {
        setHasMore(false);
      }

      const loaded = sortByBump(snapshot.docs.map(mapMessageDoc));
      setMessages(loaded);
      hydrateUserReactions(loaded.map((m) => m.id));
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const loadMoreMessages = async () => {
    if (!lastDoc || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, collectionName),
        orderBy('lastActivityAt', 'desc'),
        startAfter(lastDoc),
        limit(MESSAGES_PER_PAGE),
      );
      const snapshot = await getDocs(q);
      if (snapshot.docs.length === 0) {
        setHasMore(false);
        return;
      }
      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === MESSAGES_PER_PAGE);
      const newMessages = snapshot.docs.map(mapMessageDoc);
      setMessages((prev) => [...prev, ...newMessages]);
      hydrateUserReactions(newMessages.map((m) => m.id));
    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Lazy-fetch replies for a specific message on first expand.
  const fetchRepliesFor = useCallback(async (messageId: string) => {
    try {
      const q = query(
        collection(db, collectionName, messageId, 'replies'),
        orderBy('timestamp', 'asc'),
      );
      const snapshot = await getDocs(q);
      const replies = snapshot.docs.map(mapReplyDoc);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, replies, replyCount: replies.length, repliesLoaded: true } : m)),
      );
      hydrateUserReplyReactions(messageId, replies.map((r) => r.id));
    } catch (error) {
      console.error('Error fetching replies:', error);
    }
  }, [hydrateUserReplyReactions, collectionName]);

  const handleToggleReplies = (messageId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
    const msg = messages.find((m) => m.id === messageId);
    if (msg && !msg.repliesLoaded && (msg.replyCount ?? 0) > 0) {
      fetchRepliesFor(messageId);
    }
  };

  // Lazy-fetch reactor list for a specific message on first hover.
  const handleReactionHover = useCallback(async (messageId: string) => {
    if (fetchedReactionsRef.current.has(messageId)) return;
    fetchedReactionsRef.current.add(messageId);
    try {
      const snapshot = await getDocs(collection(db, collectionName, messageId, 'reactions'));
      const reactions = snapshot.docs.map((d) => d.data() as Reaction);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, reactions, reactionCount: reactions.length }
            : m,
        ),
      );
    } catch (error) {
      console.error('Error fetching reactions:', error);
      fetchedReactionsRef.current.delete(messageId);
    }
  }, [collectionName]);

  const handleReplyReactionHover = useCallback(async (messageId: string, replyId: string) => {
    const key = `${messageId}/${replyId}`;
    if (fetchedReplyReactionsRef.current.has(key)) return;
    fetchedReplyReactionsRef.current.add(key);
    try {
      const snapshot = await getDocs(
        collection(db, collectionName, messageId, 'replies', replyId, 'reactions'),
      );
      const reactions = snapshot.docs.map((d) => d.data() as Reaction);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                replies: m.replies?.map((r) =>
                  r.id === replyId
                    ? { ...r, reactions, reactionCount: reactions.length }
                    : r,
                ),
              }
            : m,
        ),
      );
    } catch (error) {
      console.error('Error fetching reply reactions:', error);
      fetchedReplyReactionsRef.current.delete(key);
    }
  }, [collectionName]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() && !pendingImage) return;
    if (!auth.currentUser) {
      alert('You must be logged in to send messages.');
      return;
    }
    if (!checkRateLimit()) {
      alert(`You're posting too quickly! Please wait a few minutes before posting again.`);
      return;
    }

    setLoading(true);
    try {
      const sanitizedText = sanitizeHtml(text.trim());
      if (!sanitizedText.trim() && !pendingImage) {
        alert('Your message contains invalid content. Please try again.');
        setLoading(false);
        return;
      }

      let imageId: string | undefined;
      if (pendingImage) {
        try {
          imageId = await uploadMessageImage(pendingImage);
        } catch (error) {
          console.error('Image upload failed:', error);
          alert('Failed to upload image. Please try again.');
          setLoading(false);
          return;
        }
      }

      const userData = await getUserData(auth.currentUser.uid);
      const messageData: Record<string, any> = {
        text: sanitizedText,
        userId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
        username: userData.username,
        avatar: userData.avatar,
      };
      if (imageId) messageData.imageId = imageId;

      const newDoc = await addDoc(collection(db, collectionName), messageData);
      // Optimistically prepend so the new post appears without a reload.
      setMessages((prev) => [
        {
          id: newDoc.id,
          text: sanitizedText,
          userId: auth.currentUser!.uid,
          timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
          lastActivityAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
          username: userData.username,
          avatar: userData.avatar,
          reactionCount: 0,
          replyCount: 0,
          currentUserReacted: false,
          imageId,
        },
        ...prev,
      ]);
      setPendingImage(null);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFilmAnnounce = async (variant: 1 | 2 | 3) => {
    if (!auth.currentUser) return;

    setLoading(true);
    try {
      const monthId = getCurrentMonthId();
      const prevMonthId = getPrevMonthId();
      const [snap, prevSnap] = await Promise.all([
        getDoc(doc(db, 'filmClub', monthId)),
        getDoc(doc(db, 'filmClub', prevMonthId)),
      ]);
      const monthData = snap.exists() ? snap.data() : null;
      const prevMonthData = prevSnap.exists() ? prevSnap.data() : null;

      type FilmData = { tmdbId: number; title: string; releaseYear: string; posterPath: string | null; submittedByUsername: string };
      const film = (monthData?.currentFilm ?? prevMonthData?.nextFilm) as FilmData | undefined;

      if (!film) {
        alert('No film set for this month. Set one in the Film Club admin panel first.');
        return;
      }

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      const origin = 'https://yabbyville.xyz';

      let text: string;
      let posterUrl: string | undefined;

      if (variant === 1) {
        const monthName = now.toLocaleDateString('en-GB', { month: 'long' });
        const leavingDate = new Date(year, month, 0).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

        let trailerUrl: string | null = null;
        try {
          const r = await fetch(`https://api.themoviedb.org/3/movie/${film.tmdbId}/videos?api_key=${import.meta.env.VITE_TMDB_API_KEY}`);
          const data = await r.json();
          const trailer = (data.results ?? []).find(
            (v: { type: string; site: string; key: string }) => v.type === 'Trailer' && v.site === 'YouTube'
          );
          trailerUrl = trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
        } catch { /* no trailer */ }

        posterUrl = film.posterPath ? `https://image.tmdb.org/t/p/w342${film.posterPath}` : undefined;

        const submitter = film.submittedByUsername || 'the community';
        const description = monthData?.currentFilmDescription as string | undefined;

        text = `The film has been selected for ${monthName} as <b>${film.title}</b> (${film.releaseYear}). `
          + `This was chosen by ${submitter} and will be available until ${leavingDate}. `
          + `Join the discussion over at the [film-club page](${origin}/film-club).\n\n`;

        if (description) text += `${submitter} said "${description}".\n\n`;
        const trailerPart = trailerUrl ? `Watch the trailer [here](${trailerUrl}) or ` : '';
        text += `${trailerPart}Submit your votes for next month's film [here](${origin}/film-club-vote).`;
      } else if (variant === 2) {
        const votingDeadlineDay = lastDay - 5;
        const daysUntilClose = votingDeadlineDay - now.getDate();

        posterUrl = film.posterPath ? `https://image.tmdb.org/t/p/w342${film.posterPath}` : undefined;

        text = `Filmbot reminder!\n\nYou have <b>${daysUntilClose}</b> day${daysUntilClose !== 1 ? 's' : ''} until voting closes for next month's film on [film club](${origin}/film-club)! Submit and vote for films or discuss this month's film <b>${film.title}</b> on the [message board](${origin}/filmclubmessage).`;
      } else {
        const nextFilm = monthData?.nextFilm as FilmData | undefined;
        if (!nextFilm) {
          alert('No next month\'s film set yet. Run IRV first.');
          return;
        }
        const daysLeft = lastDay - now.getDate();
        const nextMonthName = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long' });

        posterUrl = nextFilm.posterPath ? `https://image.tmdb.org/t/p/w342${nextFilm.posterPath}` : undefined;

        text = `Voting has now ended and <b>${nextMonthName}</b>'s film will be <b>${nextFilm.title}</b>. You've still got <b>${daysLeft}</b> day${daysLeft !== 1 ? 's' : ''} to watch this month's film <b>${film.title}</b> and join the discussion on the dedicated [messageboard](${origin}/filmclubmessage)!`;
      }

      const sanitizedText = sanitizeHtml(text);

      const messageData: Record<string, unknown> = {
        text: sanitizedText,
        userId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        lastActivityAt: serverTimestamp(),
        username: 'Film Club Bot',
        avatar: 'avatar_filmbot.webp',
      };
      if (posterUrl) messageData.posterUrl = posterUrl;

      const newDoc = await addDoc(collection(db, collectionName), messageData);

      setMessages((prev) => [
        {
          id: newDoc.id,
          text: sanitizedText,
          userId: auth.currentUser!.uid,
          timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
          lastActivityAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
          username: 'FilmClub Bot',
          avatar: 'avatar_filmbot.webp',
          reactionCount: 0,
          replyCount: 0,
          currentUserReacted: false,
          posterUrl,
        },
        ...prev,
      ]);
    } catch (error) {
      console.error('Film announce failed:', error);
      alert('Failed to post announcement. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleReaction = async (messageId: string) => {
    if (!auth.currentUser) {
      alert('You must be logged in to react to messages.');
      return;
    }
    const uid = auth.currentUser.uid;
    const messageRef = doc(db, collectionName, messageId);
    const reactionRef = doc(db, collectionName, messageId, 'reactions', uid);

    const current = messages.find((m) => m.id === messageId);
    const wasReacted = current?.currentUserReacted ?? false;
    const delta = wasReacted ? -1 : 1;

    // Optimistic UI.
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              currentUserReacted: !wasReacted,
              reactionCount: Math.max(0, (m.reactionCount ?? 0) + delta),
              reactions: wasReacted
                ? m.reactions?.filter((r) => r.userId !== uid)
                : m.reactions
                ? [...m.reactions, { userId: uid, username: 'You', timestamp: null }]
                : undefined,
            }
          : m,
      ),
    );

    try {
      const userData = await getUserData(uid);
      await runTransaction(db, async (tx) => {
        const existing = await tx.get(reactionRef);
        if (existing.exists()) {
          tx.delete(reactionRef);
          tx.update(messageRef, { reactionCount: increment(-1) });
        } else {
          tx.set(reactionRef, {
            userId: uid,
            username: userData.username,
            timestamp: serverTimestamp(),
          });
          tx.update(messageRef, { reactionCount: increment(1) });
        }
      });
      // Invalidate cached reactor list so next hover refetches with accurate names.
      fetchedReactionsRef.current.delete(messageId);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: undefined } : m)),
      );
    } catch (error) {
      console.error('Error toggling reaction:', error);
      // Revert optimistic state.
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                currentUserReacted: wasReacted,
                reactionCount: Math.max(0, (m.reactionCount ?? 0) - delta),
              }
            : m,
        ),
      );
      alert('Failed to update reaction. Please try again.');
    }
  };

  const handleSendReply = async (messageId: string, text: string, imageFile?: File | null) => {
    if (!text.trim() && !imageFile) return;
    if (!auth.currentUser) {
      alert('You must be logged in to send replies.');
      return;
    }

    try {
      const sanitizedText = sanitizeHtml(text.trim());
      if (!sanitizedText.trim() && !imageFile) {
        alert('Your reply contains invalid content. Please try again.');
        return;
      }

      let imageId: string | undefined;
      if (imageFile) {
        try {
          imageId = await uploadMessageImage(imageFile);
        } catch (error) {
          console.error('Image upload failed:', error);
          alert('Failed to upload image. Please try again.');
          return;
        }
      }

      const userData = await getUserData(auth.currentUser.uid);
      const replyData: Record<string, any> = {
        text: sanitizedText,
        userId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        username: userData.username,
        avatar: userData.avatar,
      };
      if (imageId) replyData.imageId = imageId;

      const newReplyRef = await addDoc(collection(db, collectionName, messageId, 'replies'), replyData);
      await updateDoc(doc(db, collectionName, messageId), {
        lastActivityAt: serverTimestamp(),
        replyCount: increment(1),
      });

      // Optimistically append reply + bump counts locally.
      const optimisticReply: Reply = {
        id: newReplyRef.id,
        text: sanitizedText,
        userId: auth.currentUser.uid,
        timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
        username: userData.username,
        avatar: userData.avatar,
        reactionCount: 0,
        currentUserReacted: false,
        imageId,
      };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                replies: m.repliesLoaded && m.replies ? [...m.replies, optimisticReply] : m.replies,
                replyCount: (m.replyCount ?? 0) + 1,
                lastActivityAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
              }
            : m,
        ),
      );
      // Auto-expand so user sees their reply.
      setExpandedReplies((prev) => new Set(prev).add(messageId));
    } catch (error) {
      console.error('Error sending reply:', error);
      alert('Failed to send reply. Please try again.');
    }
  };

  const handleToggleReplyReaction = async (messageId: string, replyId: string) => {
    if (!auth.currentUser) {
      alert('You must be logged in to react to replies.');
      return;
    }
    const uid = auth.currentUser.uid;
    const replyRef = doc(db, collectionName, messageId, 'replies', replyId);
    const reactionRef = doc(db, collectionName, messageId, 'replies', replyId, 'reactions', uid);

    const parent = messages.find((m) => m.id === messageId);
    const reply = parent?.replies?.find((r) => r.id === replyId);
    const wasReacted = reply?.currentUserReacted ?? false;
    const delta = wasReacted ? -1 : 1;

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              replies: m.replies?.map((r) =>
                r.id === replyId
                  ? {
                      ...r,
                      currentUserReacted: !wasReacted,
                      reactionCount: Math.max(0, (r.reactionCount ?? 0) + delta),
                      reactions: wasReacted
                        ? r.reactions?.filter((rr) => rr.userId !== uid)
                        : r.reactions
                        ? [...r.reactions, { userId: uid, username: 'You', timestamp: null }]
                        : undefined,
                    }
                  : r,
              ),
            }
          : m,
      ),
    );

    try {
      const userData = await getUserData(uid);
      await runTransaction(db, async (tx) => {
        const existing = await tx.get(reactionRef);
        if (existing.exists()) {
          tx.delete(reactionRef);
          tx.update(replyRef, { reactionCount: increment(-1) });
        } else {
          tx.set(reactionRef, {
            userId: uid,
            username: userData.username,
            timestamp: serverTimestamp(),
          });
          tx.update(replyRef, { reactionCount: increment(1) });
        }
      });
      fetchedReplyReactionsRef.current.delete(`${messageId}/${replyId}`);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                replies: m.replies?.map((r) => (r.id === replyId ? { ...r, reactions: undefined } : r)),
              }
            : m,
        ),
      );
    } catch (error) {
      console.error('Error toggling reply reaction:', error);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                replies: m.replies?.map((r) =>
                  r.id === replyId
                    ? {
                        ...r,
                        currentUserReacted: wasReacted,
                        reactionCount: Math.max(0, (r.reactionCount ?? 0) - delta),
                      }
                    : r,
                ),
              }
            : m,
        ),
      );
      alert('Failed to update reaction. Please try again.');
    }
  };

  const handleEditMessage = async (messageId: string, newText: string) => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, collectionName, messageId), {
        text: newText,
        editedAt: serverTimestamp(),
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, text: newText, editedAt: { seconds: Math.floor(Date.now() / 1000) } } : m,
        ),
      );
    } catch (error) {
      console.error('Error editing message:', error);
      alert('Failed to edit message. Please try again.');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!auth.currentUser) return;
    try {
      await deleteDoc(doc(db, collectionName, messageId));
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (error) {
      console.error('Error deleting message:', error);
      alert('Failed to delete message. Please try again.');
    }
  };

  const handleEditReply = async (messageId: string, replyId: string, newText: string) => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(doc(db, collectionName, messageId, 'replies', replyId), {
        text: newText,
        editedAt: serverTimestamp(),
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                replies: m.replies?.map((r) =>
                  r.id === replyId ? { ...r, text: newText, editedAt: { seconds: Math.floor(Date.now() / 1000) } } : r,
                ),
              }
            : m,
        ),
      );
    } catch (error) {
      console.error('Error editing reply:', error);
      alert('Failed to edit reply. Please try again.');
    }
  };

  const handleDeleteReply = async (messageId: string, replyId: string) => {
    if (!auth.currentUser) return;
    try {
      await deleteDoc(doc(db, collectionName, messageId, 'replies', replyId));
      await updateDoc(doc(db, collectionName, messageId), {
        replyCount: increment(-1),
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                replies: m.replies?.filter((r) => r.id !== replyId),
                replyCount: Math.max(0, (m.replyCount ?? 0) - 1),
              }
            : m,
        ),
      );
    } catch (error) {
      console.error('Error deleting reply:', error);
      alert('Failed to delete reply. Please try again.');
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

  return (
    <div className="message-board-container">
      <ForumBox onSend={handleSendMessage} disabled={loading} onImageAttach={setPendingImage} onFilmAnnounce={isAdmin ? handleFilmAnnounce : undefined} />
      <div className="messages-container">
        {messages.map((message) => (
          <UserMessage
            key={message.id}
            username={message.username || 'Anonymous'}
            message={message.text}
            timestamp={formatTimestamp(message.timestamp)}
            userSticker={message.avatar || 'default-avatar.png'}
            userId={message.userId}
            currentUserId={auth.currentUser?.uid}
            isAdmin={isAdmin}
            onEdit={(newText: string) => handleEditMessage(message.id, newText)}
            onDelete={() => handleDeleteMessage(message.id)}
            onEditReply={(replyId: string, newText: string) => handleEditReply(message.id, replyId, newText)}
            onDeleteReply={(replyId: string) => handleDeleteReply(message.id, replyId)}
            edited={!!message.editedAt}
            imageId={message.imageId}
            posterUrl={message.posterUrl}
            onClose={() => {}}
            hideCloseButton={true}
            reactions={enableReactions ? message.reactions : undefined}
            reactionCount={enableReactions ? message.reactionCount : undefined}
            currentUserReacted={enableReactions ? message.currentUserReacted : undefined}
            onToggleReaction={enableReactions ? () => handleToggleReaction(message.id) : undefined}
            onReactionHover={enableReactions ? () => handleReactionHover(message.id) : undefined}
            replies={enableReplies ? message.replies : undefined}
            replyCount={enableReplies ? message.replyCount : undefined}
            onReply={enableReplies ? (text: string, image?: File | null) => handleSendReply(message.id, text, image) : undefined}
            onToggleReplies={enableReplies ? () => handleToggleReplies(message.id) : undefined}
            repliesExpanded={enableReplies ? expandedReplies.has(message.id) : undefined}
            onToggleReplyReaction={enableReplies && enableReactions ? (replyId: string) => handleToggleReplyReaction(message.id, replyId) : undefined}
            onReplyReactionHover={enableReplies && enableReactions ? (replyId: string) => handleReplyReactionHover(message.id, replyId) : undefined}
            replyingToUsername={message.username}
            enableReplies={enableReplies}
          />
        ))}
      </div>

      {hasMore && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px', marginBottom: '20px' }}>
          <Button
            type="basic"
            label={loadingMore ? 'Loading...' : 'Load More Messages'}
            onClick={loadMoreMessages}
            disabled={loadingMore}
          />
        </div>
      )}


      {!hasMore && messages.length > 0 && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--colour4)', fontStyle: 'italic' }}>
          No more messages to load
        </div>
      )}
    </div>
  );
};

export default MessageBoard;

