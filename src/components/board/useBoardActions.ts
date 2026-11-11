import { useState, type Dispatch, type SetStateAction } from 'react';
import { collection, doc } from 'firebase/firestore';
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
  type WriteData,
} from '../../api/shadow';
import { db, auth } from '../../firebaseConfig';
import { sanitizeHtml, sanitizeText } from '../../utils/sanitise';
import { useRateLimit } from '../../utils/useRateLimit';
import { getUserData, bumpPostCount } from '../../utils/userCache';
import { postEventBotNow } from '../../utils/eventsApi';
import { uploadBoardImage } from '../../api/media';
import type { PollDraft } from '../basic/PollComposeModal';
import type { Message, Reply } from '../../types/firestore';
import { nextPollSelection, sortByBump, withPendingReply, withReaction, withoutReply } from './boardData';
import { postFilmAnnouncement } from './announcements';

interface Options {
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  setExpandedReplies: Dispatch<SetStateAction<Set<string>>>;
  boardOf: (message: Message) => string;
  loadInitialMessages: () => Promise<void>;
  collectionName: string;
  statusFilter?: 'inprogress' | 'complete';
  replyPreviewCount: number;
  enableCrossPost: boolean;
}

/** Everything a member does on the board, and the composer's attachments.
 *  Each change is shown at once and written behind, and undone if the write
 *  fails, except where noted. */
export function useBoardActions({
  messages,
  setMessages,
  setExpandedReplies,
  boardOf,
  loadInitialMessages,
  collectionName,
  statusFilter,
  replyPreviewCount,
  enableCrossPost,
}: Options) {
  const [loading, setLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPoll, setPendingPoll] = useState<PollDraft | null>(null);
  const [crossPostChecked, setCrossPostChecked] = useState(false);
  const { checkRateLimit } = useRateLimit({ maxAttempts: 10, windowMs: 5 * 60 * 1000 });

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

    let pollFields: WriteData | undefined;
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
          imageId = await uploadBoardImage(pendingImage);
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
      const messageData: WriteData = {
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
      // Prepended once written, so the new post appears without a reload.
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
    const next = nextPollSelection(current, optionIndex, msg.pollMultiple);

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

  const handleFilmAnnounce = async (variant: 1 | 2 | 3) => {
    if (!auth.currentUser) return;

    setLoading(true);
    try {
      const result = await postFilmAnnouncement(collectionName, variant, auth.currentUser.uid);
      if ('error' in result) {
        alert(result.error);
        return;
      }
      setMessages((prev) => [result.message, ...prev]);
    } catch (error) {
      console.error('Film announce failed:', error);
      alert('Failed to post announcement. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /* The Event Bot's round-up is written by the API, not from here — the same
     post the Monday schedule makes, under the same one-per-week guard. */
  const handleEventAnnounce = async () => {
    setLoading(true);
    try {
      const result = await postEventBotNow(collectionName);
      if (result.status === 'exists') {
        alert("This week's events are already posted. Delete that post to post them again.");
      } else if (result.status === 'skipped') {
        alert('Nothing on the calendar this week, so nothing was posted.');
      } else {
        await loadInitialMessages();
      }
    } catch (error) {
      console.error('Event announce failed:', error);
      alert((error as Error).message || "Could not post this week's events.");
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

    setMessages((prev) => prev.map((m) => (m.id === messageId ? withReaction(m, uid, !wasReacted) : m)));

    try {
      await updateDocShadowed(messageRef, {
        reactedBy: wasReacted ? arrayRemoveOf(uid) : arrayUnionOf(uid),
        reactionCount: incrementBy(delta),
      });
    } catch (error) {
      console.error('Error toggling reaction:', error);
      setMessages((prev) => prev.map((m) => (m.id === messageId ? withReaction(m, uid, wasReacted) : m)));
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
          imageId = await uploadBoardImage(imageFile);
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
      const replyData: WriteData = {
        text: sanitizedText,
        userId: auth.currentUser.uid,
        timestamp: SERVER_TIME,
        username: userData.username,
        avatar: userData.avatar,
        reactedBy: [],
        reactionCount: 0,
      };
      if (imageId) replyData.imageId = imageId;

      // Shown before the writes finish: they wait on the server, which on a slow
      // or backgrounded phone can be a long time, or never.
      const nowSeconds = Math.floor(Date.now() / 1000);
      const pendingId = `pending-${nowSeconds}-${Math.random().toString(36).slice(2)}`;
      const optimisticReply: Reply = {
        id: pendingId,
        text: sanitizedText,
        userId: auth.currentUser.uid,
        timestamp: { seconds: nowSeconds, nanoseconds: 0 },
        username: userData.username,
        avatar: userData.avatar,
        reactedBy: [],
        reactionCount: 0,
        currentUserReacted: false,
        imageId,
      };
      const firstReply = (message.replyCount ?? 0) === 0;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? withPendingReply(m, optimisticReply, firstReply, nowSeconds) : m)),
      );
      // Only a board with no collapsed preview needs opening to show the reply;
      // elsewhere it lands in the preview, or in the thread if already open.
      if (replyPreviewCount === 0 && (firstReply || message.repliesLoaded)) {
        setExpandedReplies((prev) => new Set(prev).add(messageId));
      }

      let newReplyId: string;
      try {
        const newReplyRef = await addDocShadowed(collection(db, board, messageId, 'replies'), replyData);
        newReplyId = newReplyRef.id;
      } catch (error) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? withoutReply(m, pendingId) : m)));
        throw error;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, replies: m.replies?.map((r) => (r.id === pendingId ? { ...r, id: newReplyId } : r)) }
            : m,
        ),
      );
      void bumpPostCount(auth.currentUser.uid);
      try {
        await updateDocShadowed(doc(db, board, messageId), {
          lastActivityAt: SERVER_TIME,
          replyCount: incrementBy(1),
        });
      } catch (error) {
        // The reply is saved; only the stored count is behind.
        console.error('Error updating reply count:', error);
      }
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

    const applyToggle = (reacted: boolean) =>
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, replies: m.replies?.map((r) => (r.id === replyId ? withReaction(r, uid, reacted) : r)) }
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

  // Edits and deletes are shown once written, not before.
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
      setMessages((prev) => prev.map((m) => (m.id === messageId ? withoutReply(m, replyId) : m)));
    } catch (error) {
      console.error('Error deleting reply:', error);
      alert('Failed to delete reply. Please try again.');
    }
  };

  return {
    loading,
    setPendingImage,
    setPendingPoll,
    crossPostChecked,
    setCrossPostChecked,
    handleSendMessage,
    handleTogglePollVote,
    handleFilmAnnounce,
    handleEventAnnounce,
    handleToggleReaction,
    handleSendReply,
    handleToggleReplyReaction,
    handleEditMessage,
    handleToggleStatus,
    handleDeleteMessage,
    handleEditReply,
    handleDeleteReply,
  };
}
