import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  doc,
  limit,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  trackedGetDoc as getDoc,
  trackedGetDocs as getDocs,
} from '../../utils/firestoreMetrics';
import { db, auth } from '../../firebaseConfig';
import { getUserData } from '../../utils/userCache';
import type { CrossPostSource, Message, Reaction } from '../../types/firestore';
import {
  CROSS_POST_CHUNK,
  MESSAGES_PER_PAGE,
  appendPage,
  applyReplyPreviews,
  mapMessageDoc,
  mapReplyDoc,
  moreToRead,
  newSourceCursors,
  pinMessage,
  takeMergedPage,
  type SourceCursor,
} from './boardData';

type Cursor = SourceCursor<QueryDocumentSnapshot<DocumentData>>;

interface Options {
  collectionName: string;
  statusFilter?: 'inprogress' | 'complete';
  crossPostSources: CrossPostSource[];
  replyPreviewCount: number;
  highlightMessageId?: string;
  enableReactions: boolean;
  enableReplies: boolean;
}

// Resolve reactor usernames for the hover tooltip from the reactedBy uid
// array via the shared user cache — no subcollection reads.
const resolveReactions = async (reactedBy: string[]): Promise<Reaction[]> => {
  return Promise.all(
    reactedBy.map(async (uid) => {
      const data = await getUserData(uid);
      return { userId: uid, username: data.username, timestamp: null };
    }),
  );
};

/** The board's list: its pages, merged with any cross-posted boards, the
 *  replies under each post, and the names behind reactions and votes. */
export function useBoardMessages({
  collectionName,
  statusFilter,
  crossPostSources,
  replyPreviewCount,
  highlightMessageId,
  enableReactions,
  enableReplies,
}: Options) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sourcesRef = useRef<Cursor[]>([]);

  /* Which collection a post's writes go to. A cross-posted thread is shown here
     but belongs to the board it came from, so everything done to it — reacting,
     replying, editing, deleting — lands there and shows on both. */
  const boardOf = (message: Message) => message.sourceBoard?.collection ?? collectionName;

  const highlightFetchedRef = useRef(false);
  const highlightScrolledRef = useRef(false);

  useEffect(() => {
    loadInitialMessages();
    // No listeners — nothing to clean up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enableReactions, enableReplies]);

  // Deep link: pin the linked message if it's beyond the first page, then scroll to it once.
  useEffect(() => {
    if (!highlightMessageId || loadingMessages) return;
    const present = messages.some((m) => m.id === highlightMessageId);
    if (!present && !highlightFetchedRef.current) {
      highlightFetchedRef.current = true;
      (async () => {
        try {
          const snap = await getDoc(doc(db, collectionName, highlightMessageId));
          if (snap.exists()) {
            const pinned = mapMessageDoc(snap as QueryDocumentSnapshot<DocumentData>, auth.currentUser?.uid);
            setMessages((prev) => pinMessage(prev, pinned));
          }
        } catch (error) {
          console.error('Error fetching linked message:', error);
        }
      })();
      return;
    }
    if (present && !highlightScrolledRef.current) {
      highlightScrolledRef.current = true;
      setTimeout(() => {
        document.getElementById(`mb-msg-${highlightMessageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightMessageId, loadingMessages, messages]);

  /* The next chunk of one board, appended to whatever of it is still buffered. */
  const fillSource = async (state: Cursor) => {
    const name = state.source ? state.source.collection : collectionName;
    const orderField = state.source ? state.source.orderField : 'lastActivityAt';
    const size = state.source ? CROSS_POST_CHUNK : MESSAGES_PER_PAGE;
    const filters = state.source
      ? [where('showOnMain', '==', true)]
      : statusFilter
        ? [where('status', '==', statusFilter)]
        : [];

    const q = query(
      collection(db, name),
      ...filters,
      orderBy(orderField, 'desc'),
      ...(state.cursor ? [startAfter(state.cursor)] : []),
      limit(size),
    );

    let snapshot;
    try {
      snapshot = await getDocs(q);
    } catch (error) {
      // A board that cannot be read is dropped rather than allowed to take the
      // list down with it: the one you are actually on still has to load.
      if (!state.source) throw error;
      console.error(`Error reading cross-posts from ${name}:`, error);
      state.exhausted = true;
      return;
    }

    if (snapshot.docs.length < size) state.exhausted = true;
    if (snapshot.docs.length > 0) state.cursor = snapshot.docs[snapshot.docs.length - 1];
    const uid = auth.currentUser?.uid;
    state.buffer.push(...snapshot.docs.map((d) => mapMessageDoc(d, uid, state.source ?? undefined)));
  };

  const loadInitialMessages = async () => {
    setLoadingMessages(true);
    try {
      const states = newSourceCursors<QueryDocumentSnapshot<DocumentData>>(crossPostSources);
      sourcesRef.current = states;

      const loaded = await takeMergedPage(states, MESSAGES_PER_PAGE, fillSource);
      setHasMore(moreToRead(states));
      setMessages(loaded);
      fetchReplyPreviews(loaded);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadMoreMessages = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const states = sourcesRef.current;
      const newMessages = await takeMergedPage(states, MESSAGES_PER_PAGE, fillSource);
      setHasMore(moreToRead(states));
      setMessages((prev) => appendPage(prev, newMessages));
      fetchReplyPreviews(newMessages);
    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  /* The newest few replies for each message that has any, so a collapsed
     thread still shows where it got to. One capped query per message with
     replies — the reason this is opt-in. */
  const fetchReplyPreviews = useCallback(async (loaded: Message[]) => {
    if (replyPreviewCount <= 0) return;
    const targets = loaded.filter((m) => (m.replyCount ?? 0) > 0 && !m.repliesLoaded && !m.replies);
    if (targets.length === 0) return;

    const uid = auth.currentUser?.uid;
    const previews = await Promise.all(
      targets.map(async (m) => {
        try {
          const q = query(
            collection(db, m.sourceBoard?.collection ?? collectionName, m.id, 'replies'),
            orderBy('timestamp', 'desc'),
            limit(replyPreviewCount),
          );
          const snapshot = await getDocs(q);
          // Fetched newest-first so the limit takes the right end; the thread
          // itself reads oldest-first.
          return { id: m.id, replies: snapshot.docs.map((d) => mapReplyDoc(d, uid)).reverse() };
        } catch (error) {
          console.error('Error fetching reply preview:', error);
          return null;
        }
      }),
    );

    setMessages((prev) => applyReplyPreviews(prev, previews));
  }, [collectionName, replyPreviewCount]);

  // Lazy-fetch replies for a specific message on first expand.
  const fetchRepliesFor = useCallback(async (board: string, messageId: string) => {
    try {
      const q = query(
        collection(db, board, messageId, 'replies'),
        orderBy('timestamp', 'asc'),
      );
      const snapshot = await getDocs(q);
      const uid = auth.currentUser?.uid;
      const replies = snapshot.docs.map((d) => mapReplyDoc(d, uid));
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, replies, replyCount: replies.length, repliesLoaded: true } : m)),
      );
    } catch (error) {
      console.error('Error fetching replies:', error);
    }
  }, []);

  const handleToggleReplies = (message: Message) => {
    const messageId = message.id;
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
    if (!message.repliesLoaded && (message.replyCount ?? 0) > 0) {
      fetchRepliesFor(boardOf(message), messageId);
    }
  };

  const handleReactionHover = useCallback(async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg || msg.reactions || !msg.reactedBy?.length) return;
    try {
      const reactions = await resolveReactions(msg.reactedBy);
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
      );
    } catch (error) {
      console.error('Error resolving reactions:', error);
    }
  }, [messages]);

  const handleReplyReactionHover = useCallback(async (messageId: string, replyId: string) => {
    const reply = messages.find((m) => m.id === messageId)?.replies?.find((r) => r.id === replyId);
    if (!reply || reply.reactions || !reply.reactedBy?.length) return;
    try {
      const reactions = await resolveReactions(reply.reactedBy);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                replies: m.replies?.map((r) => (r.id === replyId ? { ...r, reactions } : r)),
              }
            : m,
        ),
      );
    } catch (error) {
      console.error('Error resolving reply reactions:', error);
    }
  }, [messages]);

  const handlePollVoterHover = async (messageId: string, optionIndex: number) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.pollVotes || msg.pollVoterNames?.[optionIndex]) return;
    const uids = Object.entries(msg.pollVotes)
      .filter(([, selection]) => selection.includes(optionIndex))
      .map(([uid]) => uid);
    if (uids.length === 0) return;
    try {
      const names = await Promise.all(uids.map(async (uid) => (await getUserData(uid)).username));
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, pollVoterNames: { ...m.pollVoterNames, [optionIndex]: names } }
            : m,
        ),
      );
    } catch (error) {
      console.error('Error resolving poll voters:', error);
    }
  };

  return {
    messages,
    setMessages,
    loadingMessages,
    hasMore,
    loadingMore,
    expandedReplies,
    setExpandedReplies,
    boardOf,
    loadInitialMessages,
    loadMoreMessages,
    handleToggleReplies,
    handleReactionHover,
    handleReplyReactionHover,
    handlePollVoterHover,
  };
}
