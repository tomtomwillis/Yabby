import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  doc,
  limit,
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  trackedGetDoc as getDoc,
  trackedGetDocs as getDocs,
} from '../utils/firestoreMetrics';
// Writes go through the shadow wrappers: they write Firestore exactly as
// before — still counted by firestoreMetrics — and then report to the API so
// the SQLite copy keeps up. SERVER_TIME and the transform helpers stand in for
// the Firestore sentinels, which are indistinguishable from one another once
// they are inside a patch.
import {
  addDocShadowed,
  updateDocShadowed,
  deleteDocShadowed,
  SERVER_TIME,
  incrementBy,
  arrayUnionOf,
  arrayRemoveOf,
} from '../api/shadow';
import type { DocumentData } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { sanitizeHtml, sanitizeText } from '../utils/sanitise';
import UserMessage from './basic/UserMessages';
import './MessageBoard.css';
import ForumBox from './basic/ForumMessageBox';
import type { PollDraft } from './basic/PollComposeModal';
import Button from './basic/Button';
import { useRateLimit } from '../utils/useRateLimit';
import { useAdmin } from '../utils/useAdmin';
import { getUserData, bumpPostCount } from '../utils/userCache';
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
  reactedBy?: string[];
  reactionCount?: number;
  currentUserReacted?: boolean;
  editedAt?: any;
  imageId?: string;
}

/** Another board whose cross-posted threads are listed on this one. The thread
    itself still lives on the board it names — reacting, replying and editing it
    here all write there — and the tag on the post links back to it. */
export interface CrossPostSource {
  collection: string;
  /** Field that collection is ordered by; news has no lastActivityAt. */
  orderField: 'lastActivityAt' | 'timestamp';
  /** Wording of the tag drawn on the post, and where it points. */
  label: string;
  href: string;
  /** That board's post length cap, so editing one of its posts from here is
      held to the same limit it was written under. Defaults to this board's. */
  postMaxWords?: number;
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
  reactedBy?: string[];
  reactionCount?: number;
  currentUserReacted?: boolean;
  replies?: Reply[];
  replyCount?: number;
  repliesLoaded?: boolean;
  editedAt?: any;
  imageId?: string;
  posterUrl?: string;
  status?: string;
  pollQuestion?: string;
  pollOptions?: string[];
  pollMultiple?: boolean;
  pollVotes?: Record<string, number[]>;
  pollVoterNames?: Record<number, string[]>;
  /** Set when the post came from another board. */
  sourceBoard?: CrossPostSource;
  /** Announcement posted under a bot identity. Admin-only to write, so it is
      the one marker on a post that a member cannot forge. */
  isBot?: boolean;
}

interface MessageBoardProps {
  enableReactions?: boolean;
  enableReplies?: boolean;
  collectionName?: string;
  // When set, only messages with this status are loaded and new posts are
  // created as 'inprogress'. Changing the filter requires a remount (key prop).
  statusFilter?: 'inprogress' | 'complete';
  enablePolls?: boolean;
  enableFilmAnnounce?: boolean;
  showComposer?: boolean;
  highlightMessageId?: string;
  // Forum identity block under each poster's name. Costs a users read per
  // distinct author on screen, so only the message board turns it on.
  showPosterStats?: boolean;
  /** Leave the newest N replies on show under each post instead of hiding the
      whole thread behind the toggle. Off by default because it is not free: a
      page of messages costs one extra (N-document) subcollection query per
      message that has replies. Where a thread turns out to be no longer than
      the preview, that query has fetched all of it and expanding costs
      nothing. */
  replyPreviewCount?: number;
  /** Draw the composer with the signed-in user's avatar beside it. */
  showComposerAvatar?: boolean;
  /** Rendered between the composer and the thread list — the board's own
      heading for the list, which only the page above knows the wording of. */
  listHeader?: React.ReactNode;
  /** The ledger layout: every composer on the board — the one at the top, and
      the reply and edit boxes inside a post — puts send, attach and the counter
      in a row under the field rather than inside it. */
  ledger?: boolean;
  /** Other boards whose cross-posted threads are listed here alongside this
      board's own, newest activity first. */
  crossPostSources?: CrossPostSource[];
  /** Offer a tick box on the composer that also lists the post on the main
      board. Writes showOnMain, which is what the main board queries on. */
  enableCrossPost?: boolean;
  composerPlaceholder?: string;
  /** How long a post on this board may be. News runs to essays; chat does not.
      Applies to the composer and to the edit box on a post, not to replies. */
  postMaxWords?: number;
  postMaxChars?: number;
}

const MESSAGES_PER_PAGE = 20;
/* Cross-posts are the exception rather than the rule, so the other boards are
   read a handful at a time. What is fetched and not used stays buffered for the
   next page, so paging on usually costs one query, not three. */
const CROSS_POST_CHUNK = 5;

/** One board being read, and where its reading got to. */
interface SourceCursor {
  /** null for the board's own collection. */
  source: CrossPostSource | null;
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  buffer: Message[];
  exhausted: boolean;
}

const NO_CROSS_POST_SOURCES: CrossPostSource[] = [];
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

function bumpSeconds(message: Message): number {
  return (message.lastActivityAt ?? message.timestamp)?.seconds ?? 0;
}

function sortByBump(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => bumpSeconds(b) - bumpSeconds(a));
}

function mapMessageDoc(docSnap: QueryDocumentSnapshot<DocumentData>, source?: CrossPostSource): Message {
  const data = docSnap.data();
  const reactedBy: string[] = Array.isArray(data.reactedBy) ? data.reactedBy : [];
  const uid = auth.currentUser?.uid;
  return {
    id: docSnap.id,
    text: data.text,
    userId: data.userId,
    timestamp: data.timestamp,
    lastActivityAt: data.lastActivityAt,
    username: data.username || 'Anonymous',
    avatar: data.avatar || '',
    reactedBy,
    reactionCount: typeof data.reactionCount === 'number' ? data.reactionCount : reactedBy.length,
    replyCount: typeof data.replyCount === 'number' ? data.replyCount : 0,
    currentUserReacted: uid ? reactedBy.includes(uid) : false,
    editedAt: data.editedAt,
    imageId: data.imageId || undefined,
    posterUrl: data.posterUrl || undefined,
    status: data.status || undefined,
    pollQuestion: data.pollQuestion || undefined,
    pollOptions: Array.isArray(data.pollOptions) ? data.pollOptions : undefined,
    pollMultiple: data.pollMultiple,
    pollVotes: data.pollVotes && typeof data.pollVotes === 'object' ? data.pollVotes : undefined,
    sourceBoard: source,
    isBot: data.isBot === true,
  };
}

function mapReplyDoc(docSnap: QueryDocumentSnapshot<DocumentData>): Reply {
  const data = docSnap.data();
  const reactedBy: string[] = Array.isArray(data.reactedBy) ? data.reactedBy : [];
  const uid = auth.currentUser?.uid;
  return {
    id: docSnap.id,
    text: data.text,
    userId: data.userId,
    timestamp: data.timestamp,
    username: data.username || 'Anonymous',
    avatar: data.avatar || '',
    reactedBy,
    reactionCount: typeof data.reactionCount === 'number' ? data.reactionCount : reactedBy.length,
    currentUserReacted: uid ? reactedBy.includes(uid) : false,
    editedAt: data.editedAt,
    imageId: data.imageId,
  };
}

const MessageBoard: React.FC<MessageBoardProps> = ({
  enableReactions = false,
  enableReplies = false,
  collectionName = 'messages',
  statusFilter,
  enablePolls = true,
  enableFilmAnnounce = true,
  showComposer = true,
  highlightMessageId,
  showPosterStats = false,
  replyPreviewCount = 0,
  showComposerAvatar = false,
  listHeader,
  ledger = false,
  crossPostSources = NO_CROSS_POST_SOURCES,
  enableCrossPost = false,
  composerPlaceholder,
  postMaxWords = 250,
  postMaxChars = 1000,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPoll, setPendingPoll] = useState<PollDraft | null>(null);
  const [composerAvatar, setComposerAvatar] = useState<string>('');
  const [composerName, setComposerName] = useState<string>('');
  const [crossPostChecked, setCrossPostChecked] = useState(false);
  const sourcesRef = useRef<SourceCursor[]>([]);

  const { isAdmin } = useAdmin();
  const { checkRateLimit } = useRateLimit({ maxAttempts: 10, windowMs: 5 * 60 * 1000 });

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

  // Your own avatar for the composer. Goes through the shared profile cache,
  // so on a board where you have already posted it is free.
  useEffect(() => {
    if (!showComposerAvatar) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let live = true;
    getUserData(uid).then((data) => {
      if (!live) return;
      setComposerAvatar(data.avatar);
      setComposerName(data.username);
    });
    return () => {
      live = false;
    };
  }, [showComposerAvatar]);

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
            const pinned = mapMessageDoc(snap as QueryDocumentSnapshot<DocumentData>);
            setMessages((prev) => [pinned, ...prev.filter((m) => m.id !== highlightMessageId)]);
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
  const fillSource = async (state: SourceCursor) => {
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
    state.buffer.push(...snapshot.docs.map((d) => mapMessageDoc(d, state.source ?? undefined)));
  };

  /* One page of the list, merged from every board being read. Each board is
     ordered newest-first already, so taking whichever buffered post is newest
     until the page is full gives the same order across all of them — as long as
     a board that could still have something newer is topped up first, which is
     what the fill below guarantees. */
  const takeMergedPage = async (states: SourceCursor[], count: number): Promise<Message[]> => {
    const page: Message[] = [];
    while (page.length < count) {
      await Promise.all(states.filter((s) => s.buffer.length === 0 && !s.exhausted).map(fillSource));

      let next: SourceCursor | null = null;
      for (const state of states) {
        if (state.buffer.length === 0) continue;
        if (!next || bumpSeconds(state.buffer[0]) > bumpSeconds(next.buffer[0])) next = state;
      }
      if (!next) break;
      page.push(next.buffer.shift()!);
    }
    return page;
  };

  const moreToRead = (states: SourceCursor[]) => states.some((s) => s.buffer.length > 0 || !s.exhausted);

  const loadInitialMessages = async () => {
    setLoadingMessages(true);
    try {
      const states: SourceCursor[] = [
        { source: null, cursor: null, buffer: [], exhausted: false },
        ...crossPostSources.map((source) => ({ source, cursor: null, buffer: [], exhausted: false })),
      ];
      sourcesRef.current = states;

      const loaded = await takeMergedPage(states, MESSAGES_PER_PAGE);
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
      const newMessages = await takeMergedPage(states, MESSAGES_PER_PAGE);
      setHasMore(moreToRead(states));
      // Dedupe: a deep-linked message pinned to the top can page back in.
      setMessages((prev) => [...prev, ...newMessages.filter((nm) => !prev.some((p) => p.id === nm.id))]);
      fetchReplyPreviews(newMessages);
    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  /* The newest few replies for each message that has any, so a collapsed
     thread still shows where it got to. One capped query per message with
     replies — the reason this is opt-in.

     The result is written into `replies`, not a second array: every handler on
     this board (react, edit, delete) already operates on `replies`, and a
     preview that lived somewhere else would go stale the moment one of them
     fired. `repliesLoaded` stays false while it is only the tail, so expanding
     still goes and gets the rest — unless the thread turned out to be no
     longer than the preview, in which case this was the whole thread and the
     expand is free. */
  const fetchReplyPreviews = useCallback(async (loaded: Message[]) => {
    if (replyPreviewCount <= 0) return;
    const targets = loaded.filter((m) => (m.replyCount ?? 0) > 0 && !m.repliesLoaded && !m.replies);
    if (targets.length === 0) return;

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
          return { id: m.id, replies: snapshot.docs.map(mapReplyDoc).reverse() };
        } catch (error) {
          console.error('Error fetching reply preview:', error);
          return null;
        }
      }),
    );

    setMessages((prev) =>
      prev.map((m) => {
        const hit = previews.find((p) => p?.id === m.id);
        if (!hit || m.repliesLoaded) return m;
        const complete = (m.replyCount ?? 0) <= hit.replies.length;
        return { ...m, replies: hit.replies, repliesLoaded: complete };
      }),
    );
  }, [collectionName, replyPreviewCount]);

  // Lazy-fetch replies for a specific message on first expand.
  const fetchRepliesFor = useCallback(async (board: string, messageId: string) => {
    try {
      const q = query(
        collection(db, board, messageId, 'replies'),
        orderBy('timestamp', 'asc'),
      );
      const snapshot = await getDocs(q);
      const replies = snapshot.docs.map(mapReplyDoc);
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

  const handleSendMessage = async (text: string) => {
    if (!text.trim() && !pendingImage && !pendingPoll) return;
    if (!auth.currentUser) {
      alert('You must be logged in to send messages.');
      return;
    }
    if (!checkRateLimit()) {
      alert(`You're posting too quickly! Please wait a few minutes before posting again.`);
      return;
    }

    let pollFields: Record<string, any> | undefined;
    if (pendingPoll) {
      const sanitizedQuestion = sanitizeText(pendingPoll.question);
      const sanitizedOptions = pendingPoll.options.map((o) => sanitizeText(o)).filter(Boolean);
      if (!sanitizedQuestion || sanitizedOptions.length < 2) {
        alert('Your poll contains invalid content. Please try again.');
        return;
      }
      pollFields = {
        pollQuestion: sanitizedQuestion,
        pollOptions: sanitizedOptions,
        pollMultiple: pendingPoll.multiple,
        pollVotes: {},
      };
    }

    setLoading(true);
    try {
      const sanitizedText = sanitizeHtml(text.trim());
      if (!sanitizedText.trim() && !pendingImage && !pollFields) {
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
      // Posts carry the poster's name, and the rules refuse one that is not
      // the name on the profile — so a profile with no name cannot post at
      // all, and saying "try again" would send them round the same loop.
      if (!userData.hasUsername) {
        alert('Set a username on your profile before posting.');
        setLoading(false);
        return;
      }
      const messageData: Record<string, any> = {
        text: sanitizedText,
        userId: auth.currentUser.uid,
        timestamp: SERVER_TIME,
        lastActivityAt: SERVER_TIME,
        username: userData.username,
        avatar: userData.avatar,
        reactedBy: [],
        reactionCount: 0,
        ...pollFields,
      };
      if (imageId) messageData.imageId = imageId;
      if (statusFilter) messageData.status = 'inprogress';
      if (enableCrossPost && crossPostChecked) messageData.showOnMain = true;

      const newDoc = await addDocShadowed(collection(db, collectionName), messageData);
      void bumpPostCount(auth.currentUser.uid);
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
          reactedBy: [],
          reactionCount: 0,
          replyCount: 0,
          currentUserReacted: false,
          imageId,
          status: statusFilter ? 'inprogress' : undefined,
          ...pollFields,
        },
        ...prev,
      ]);
      setPendingImage(null);
      setPendingPoll(null);
      setCrossPostChecked(false);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePollVote = async (message: Message, optionIndex: number) => {
    if (!auth.currentUser) {
      alert('You must be logged in to vote.');
      return;
    }
    const uid = auth.currentUser.uid;
    const messageId = message.id;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.pollOptions) return;
    const current = msg.pollVotes?.[uid] ?? [];

    let next: number[];
    if (msg.pollMultiple) {
      next = current.includes(optionIndex)
        ? current.filter((i) => i !== optionIndex)
        : [...current, optionIndex];
    } else {
      next = current.length === 1 && current[0] === optionIndex ? [] : [optionIndex];
    }

    const applyLocal = (selection: number[]) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, pollVotes: { ...m.pollVotes, [uid]: selection }, pollVoterNames: undefined }
            : m,
        ),
      );

    applyLocal(next);
    try {
      await updateDocShadowed(doc(db, boardOf(message), messageId), { [`pollVotes.${uid}`]: next });
    } catch (error) {
      console.error('Error toggling poll vote:', error);
      applyLocal(current);
      alert('Failed to update your vote. Please try again.');
    }
  };

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
        timestamp: SERVER_TIME,
        lastActivityAt: SERVER_TIME,
        username: 'Film Club Bot',
        avatar: 'avatar_filmbot.webp',
        reactedBy: [],
        reactionCount: 0,
        isBot: true,
      };
      if (posterUrl) messageData.posterUrl = posterUrl;

      const newDoc = await addDocShadowed(collection(db, collectionName), messageData);

      setMessages((prev) => [
        {
          id: newDoc.id,
          text: sanitizedText,
          userId: auth.currentUser!.uid,
          timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
          lastActivityAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
          username: 'Film Club Bot',
          avatar: 'avatar_filmbot.webp',
          reactedBy: [],
          reactionCount: 0,
          replyCount: 0,
          currentUserReacted: false,
          posterUrl,
          isBot: true,
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

  const handleToggleReaction = async (message: Message) => {
    if (!auth.currentUser) {
      alert('You must be logged in to react to messages.');
      return;
    }
    const uid = auth.currentUser.uid;
    const messageId = message.id;
    const messageRef = doc(db, boardOf(message), messageId);

    const current = messages.find((m) => m.id === messageId);
    const wasReacted = current?.currentUserReacted ?? false;
    const delta = wasReacted ? -1 : 1;

    // Optimistic UI; reactions tooltip is re-resolved from reactedBy on next hover.
    const toggleLocal = (m: Message, reacted: boolean): Message => ({
      ...m,
      currentUserReacted: reacted,
      reactionCount: Math.max(0, (m.reactionCount ?? 0) + (reacted ? 1 : -1)),
      reactedBy: reacted
        ? [...(m.reactedBy ?? []), uid]
        : (m.reactedBy ?? []).filter((id) => id !== uid),
      reactions: undefined,
    });

    setMessages((prev) => prev.map((m) => (m.id === messageId ? toggleLocal(m, !wasReacted) : m)));

    try {
      await updateDocShadowed(messageRef, {
        reactedBy: wasReacted ? arrayRemoveOf(uid) : arrayUnionOf(uid),
        reactionCount: incrementBy(delta),
      });
    } catch (error) {
      console.error('Error toggling reaction:', error);
      // Revert optimistic state.
      setMessages((prev) => prev.map((m) => (m.id === messageId ? toggleLocal(m, wasReacted) : m)));
      alert('Failed to update reaction. Please try again.');
    }
  };

  const handleSendReply = async (message: Message, text: string, imageFile?: File | null) => {
    if (!text.trim() && !imageFile) return;
    const board = boardOf(message);
    const messageId = message.id;
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
      if (!userData.hasUsername) {
        alert('Set a username on your profile before replying.');
        return;
      }
      const replyData: Record<string, any> = {
        text: sanitizedText,
        userId: auth.currentUser.uid,
        timestamp: SERVER_TIME,
        username: userData.username,
        avatar: userData.avatar,
        reactedBy: [],
        reactionCount: 0,
      };
      if (imageId) replyData.imageId = imageId;

      const newReplyRef = await addDocShadowed(collection(db, board, messageId, 'replies'), replyData);
      void bumpPostCount(auth.currentUser.uid);
      await updateDocShadowed(doc(db, board, messageId), {
        lastActivityAt: SERVER_TIME,
        replyCount: incrementBy(1),
      });

      // Optimistically append reply + bump counts locally.
      const optimisticReply: Reply = {
        id: newReplyRef.id,
        text: sanitizedText,
        userId: auth.currentUser.uid,
        timestamp: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
        username: userData.username,
        avatar: userData.avatar,
        reactedBy: [],
        reactionCount: 0,
        currentUserReacted: false,
        imageId,
      };
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                // Appended whenever anything is held, loaded thread or preview
                // tail alike: in both cases the newest reply belongs on the
                // end, and the preview is read from that end.
                replies: m.replies ? [...m.replies, optimisticReply] : m.replies,
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

  const handleToggleReplyReaction = async (message: Message, replyId: string) => {
    if (!auth.currentUser) {
      alert('You must be logged in to react to replies.');
      return;
    }
    const uid = auth.currentUser.uid;
    const messageId = message.id;
    const replyRef = doc(db, boardOf(message), messageId, 'replies', replyId);

    const parent = messages.find((m) => m.id === messageId);
    const reply = parent?.replies?.find((r) => r.id === replyId);
    const wasReacted = reply?.currentUserReacted ?? false;
    const delta = wasReacted ? -1 : 1;

    const toggleLocal = (r: Reply, reacted: boolean): Reply => ({
      ...r,
      currentUserReacted: reacted,
      reactionCount: Math.max(0, (r.reactionCount ?? 0) + (reacted ? 1 : -1)),
      reactedBy: reacted
        ? [...(r.reactedBy ?? []), uid]
        : (r.reactedBy ?? []).filter((id) => id !== uid),
      reactions: undefined,
    });

    const applyToggle = (reacted: boolean) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, replies: m.replies?.map((r) => (r.id === replyId ? toggleLocal(r, reacted) : r)) }
            : m,
        ),
      );

    applyToggle(!wasReacted);

    try {
      await updateDocShadowed(replyRef, {
        reactedBy: wasReacted ? arrayRemoveOf(uid) : arrayUnionOf(uid),
        reactionCount: incrementBy(delta),
      });
    } catch (error) {
      console.error('Error toggling reply reaction:', error);
      applyToggle(wasReacted);
      alert('Failed to update reaction. Please try again.');
    }
  };

  const handleEditMessage = async (message: Message, newText: string) => {
    if (!auth.currentUser) return;
    const messageId = message.id;
    try {
      await updateDocShadowed(doc(db, boardOf(message), messageId), {
        text: newText,
        editedAt: SERVER_TIME,
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

  const handleToggleStatus = async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;
    const newStatus = msg.status === 'complete' ? 'inprogress' : 'complete';
    // Optimistic: the message no longer matches the active tab's filter.
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await updateDocShadowed(doc(db, collectionName, messageId), { status: newStatus });
      window.umami?.track?.('issue-status-toggled', { status: newStatus });
    } catch (error) {
      console.error('Error updating status:', error);
      setMessages((prev) => sortByBump([...prev, msg]));
      alert('Failed to update status. Please try again.');
    }
  };

  const handleDeleteMessage = async (message: Message) => {
    if (!auth.currentUser) return;
    const messageId = message.id;
    try {
      await deleteDocShadowed(doc(db, boardOf(message), messageId));
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (error) {
      console.error('Error deleting message:', error);
      alert('Failed to delete message. Please try again.');
    }
  };

  const handleEditReply = async (message: Message, replyId: string, newText: string) => {
    if (!auth.currentUser) return;
    const messageId = message.id;
    try {
      await updateDocShadowed(doc(db, boardOf(message), messageId, 'replies', replyId), {
        text: newText,
        editedAt: SERVER_TIME,
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

  const handleDeleteReply = async (message: Message, replyId: string) => {
    if (!auth.currentUser) return;
    const board = boardOf(message);
    const messageId = message.id;
    try {
      await deleteDocShadowed(doc(db, board, messageId, 'replies', replyId));
      await updateDocShadowed(doc(db, board, messageId), {
        replyCount: incrementBy(-1),
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
      {showComposer && (
        <ForumBox onSend={handleSendMessage} disabled={loading} placeholder={composerPlaceholder} maxWords={postMaxWords} maxChars={postMaxChars} onImageAttach={setPendingImage} onFilmAnnounce={isAdmin && enableFilmAnnounce ? handleFilmAnnounce : undefined} onPollAttach={enablePolls ? setPendingPoll : undefined} avatar={showComposerAvatar ? composerAvatar : undefined} avatarName={showComposerAvatar ? composerName : undefined} outsideControls={ledger} crossPost={enableCrossPost ? { label: 'also post to the message board', checked: crossPostChecked, onChange: setCrossPostChecked } : undefined} />
      )}
      {listHeader}
      <div className="messages-container">
        {loadingMessages && <p className="messages-loading">Loading messages...</p>}
        {messages.map((message) => {
          const canReact = enableReactions;
          const canReply = enableReplies;
          return (
          <div key={`${message.sourceBoard?.collection ?? ''}${message.id}`} id={`mb-msg-${message.id}`} className={message.id === highlightMessageId ? 'mb-msg-highlight' : undefined}>
          <UserMessage
            username={message.username || 'Anonymous'}
            message={message.text}
            timestamp={formatTimestamp(message.timestamp)}
            userSticker={message.avatar || 'default-avatar.png'}
            userId={message.userId}
            isBot={message.isBot}
            currentUserId={auth.currentUser?.uid}
            isAdmin={isAdmin}
            showPosterStats={showPosterStats}
            replyPreviewCount={canReply ? replyPreviewCount : 0}
            ledgerControls={ledger}
            postMaxWords={message.sourceBoard?.postMaxWords ?? postMaxWords}
            sourceTag={message.sourceBoard && { label: message.sourceBoard.label, href: message.sourceBoard.href }}
            onEdit={(newText: string) => handleEditMessage(message, newText)}
            onDelete={() => handleDeleteMessage(message)}
            onEditReply={(replyId: string, newText: string) => handleEditReply(message, replyId, newText)}
            onDeleteReply={(replyId: string) => handleDeleteReply(message, replyId)}
            edited={!!message.editedAt}
            imageId={message.imageId}
            posterUrl={message.posterUrl}
            pollQuestion={message.pollQuestion}
            pollOptions={message.pollOptions}
            pollMultiple={message.pollMultiple}
            pollVotes={message.pollVotes}
            pollVoterNames={message.pollVoterNames}
            onTogglePollVote={(optionIndex: number) => handleTogglePollVote(message, optionIndex)}
            onPollVoterHover={(optionIndex: number) => handlePollVoterHover(message.id, optionIndex)}
            onClose={() => {}}
            hideCloseButton={true}
            reactions={canReact ? message.reactions : undefined}
            reactionCount={canReact ? message.reactionCount : undefined}
            currentUserReacted={canReact ? message.currentUserReacted : undefined}
            onToggleReaction={canReact ? () => handleToggleReaction(message) : undefined}
            onReactionHover={canReact ? () => handleReactionHover(message.id) : undefined}
            replies={canReply ? message.replies : undefined}
            replyCount={canReply ? message.replyCount : undefined}
            onReply={canReply ? (text: string, image?: File | null) => handleSendReply(message, text, image) : undefined}
            onToggleReplies={canReply ? () => handleToggleReplies(message) : undefined}
            repliesExpanded={canReply ? expandedReplies.has(message.id) : undefined}
            onToggleReplyReaction={canReply && canReact ? (replyId: string) => handleToggleReplyReaction(message, replyId) : undefined}
            onReplyReactionHover={canReply && canReact ? (replyId: string) => handleReplyReactionHover(message.id, replyId) : undefined}
            replyingToUsername={message.username}
            enableReplies={canReply}
            status={message.status as 'inprogress' | 'complete' | undefined}
            onToggleStatus={isAdmin && statusFilter && !message.sourceBoard ? () => handleToggleStatus(message.id) : undefined}
          />
          </div>
          );
        })}
      </div>

      {!loadingMessages && hasMore && (
        <div className="messages-more">
          <Button
            type="basic"
            label={loadingMore ? 'Loading...' : 'Load More Messages'}
            onClick={loadMoreMessages}
            disabled={loadingMore}
          />
        </div>
      )}


      {!loadingMessages && !hasMore && messages.length > 0 && (
        <div className="messages-end">
          No more messages to load
        </div>
      )}
    </div>
  );
};

export default MessageBoard;

