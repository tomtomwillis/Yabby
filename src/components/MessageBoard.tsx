import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, addDoc, query, onSnapshot, orderBy, doc, getDocs, setDoc, deleteDoc, updateDoc, serverTimestamp, limit, startAfter, QueryDocumentSnapshot, increment, writeBatch } from 'firebase/firestore';
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
  editedAt?: any;
  imageId?: string;
}

interface MessageBoardProps {
  enableReactions?: boolean;
  enableReplies?: boolean;
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

const MessageBoard: React.FC<MessageBoardProps> = ({ enableReactions = false, enableReplies = false }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [activeReplyInput, setActiveReplyInput] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingImage, setPendingImage] = useState<File | null>(null);

  // Listener cleanup refs
  const messagesUnsubRef = useRef<(() => void) | null>(null);
  const replyUnsubsRef = useRef<Map<string, () => void>>(new Map());

  const { isAdmin } = useAdmin();

  // Rate limiting: 10 messages per 5 minutes
  const { checkRateLimit, getRemainingAttempts } = useRateLimit({
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000, // 5 minutes
  });

  useEffect(() => {
    loadInitialMessages();

    return () => {
      messagesUnsubRef.current?.();
      messagesUnsubRef.current = null;
      replyUnsubsRef.current.forEach(unsub => unsub());
      replyUnsubsRef.current.clear();
    };
  }, [enableReactions, enableReplies]);

  const loadInitialMessages = () => {
    messagesUnsubRef.current?.();

    const q = query(
      collection(db, 'messages'),
      orderBy('timestamp', 'desc'),
      limit(MESSAGES_PER_PAGE)
    );

    const unsub = onSnapshot(q, async (snapshot) => {
      try {
        if (snapshot.docs.length > 0) {
          setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
          setHasMore(snapshot.docs.length === MESSAGES_PER_PAGE);
        } else {
          setHasMore(false);
        }

        // Only check reaction status for newly added messages
        const addedIds = new Set(
          snapshot.docChanges()
            .filter(change => change.type === 'added')
            .map(change => change.doc.id)
        );

        const messagePromises = snapshot.docs.map(async (docSnapshot) => {
          const messageData = docSnapshot.data();
          const userData = await getUserData(messageData.userId);

          // Fetch full reactions for newly added messages (provides count + tooltip + user status)
          let reactions: Reaction[] = [];
          let reactionCount = 0;
          let currentUserReacted: boolean | undefined;
          if (enableReactions && addedIds.has(docSnapshot.id)) {
            try {
              const reactionsSnap = await getDocs(
                collection(db, 'messages', docSnapshot.id, 'reactions')
              );
              reactions = reactionsSnap.docs.map(d => d.data() as Reaction);
              reactionCount = reactions.length;
              currentUserReacted = reactions.some(r => r.userId === auth.currentUser?.uid);
            } catch { /* ignore */ }
          }

          return {
            id: docSnapshot.id,
            text: messageData.text,
            userId: messageData.userId,
            timestamp: messageData.timestamp,
            lastActivityAt: messageData.lastActivityAt,
            username: userData.username,
            avatar: userData.avatar,
            reactions,
            reactionCount,
            currentUserReacted,
            replyCount: messageData.replyCount || 0,
            editedAt: messageData.editedAt,
            imageId: messageData.imageId || undefined,
          };
        });

        const processed = await Promise.all(messagePromises);

        setMessages(prev => {
          const prevMap = new Map(prev.map(m => [m.id, m]));

          const merged = processed.map(msg => {
            const existing = prevMap.get(msg.id);
            return {
              ...msg,
              // Preserve locally-tracked reaction data for existing messages
              reactions: (msg.reactions && msg.reactions.length > 0) ? msg.reactions : (existing?.reactions || []),
              reactionCount: msg.currentUserReacted !== undefined ? msg.reactionCount : (existing?.reactionCount ?? 0),
              currentUserReacted: msg.currentUserReacted ?? existing?.currentUserReacted ?? false,
              // Preserve loaded replies for expanded threads
              replies: existing?.replies || [],
            } as Message;
          });

          merged.sort((a, b) => {
            const aTime = (a.lastActivityAt ?? a.timestamp)?.seconds ?? 0;
            const bTime = (b.lastActivityAt ?? b.timestamp)?.seconds ?? 0;
            return bTime - aTime;
          });

          return merged;
        });
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    });

    messagesUnsubRef.current = unsub;
  };

  // Subscribe to replies for a specific message (on-demand, when expanded)
  const subscribeToReplies = useCallback((messageId: string) => {
    replyUnsubsRef.current.get(messageId)?.();

    const repliesQuery = query(
      collection(db, 'messages', messageId, 'replies'),
      orderBy('timestamp', 'asc')
    );

    const unsub = onSnapshot(repliesQuery, async (snapshot) => {
      const addedReplyIds = new Set(
        snapshot.docChanges()
          .filter(change => change.type === 'added')
          .map(change => change.doc.id)
      );

      const replyPromises = snapshot.docs.map(async (replyDoc) => {
        const replyData = replyDoc.data();
        const userData = await getUserData(replyData.userId);

        // Fetch full reactions for newly added replies (provides count + tooltip + user status)
        let reactions: Reaction[] = [];
        let currentUserReacted = false;
        let reactionCount = 0;

        if (enableReactions && addedReplyIds.has(replyDoc.id)) {
          try {
            const reactionsSnap = await getDocs(
              collection(db, 'messages', messageId, 'replies', replyDoc.id, 'reactions')
            );
            reactions = reactionsSnap.docs.map(d => d.data() as Reaction);
            reactionCount = reactions.length;
            currentUserReacted = reactions.some(r => r.userId === auth.currentUser?.uid);
          } catch { /* ignore */ }
        }

        return {
          id: replyDoc.id,
          text: replyData.text,
          userId: replyData.userId,
          timestamp: replyData.timestamp,
          username: userData.username,
          avatar: userData.avatar,
          reactions,
          reactionCount,
          currentUserReacted,
          editedAt: replyData.editedAt,
          imageId: replyData.imageId,
        };
      });

      const replies = await Promise.all(replyPromises);

      setMessages(prev =>
        prev.map(msg => {
          if (msg.id !== messageId) return msg;
          // Preserve reaction data for existing replies
          const prevReplyMap = new Map((msg.replies || []).map(r => [r.id, r]));
          const mergedReplies = replies.map(reply => {
            const existing = prevReplyMap.get(reply.id);
            if (existing && !addedReplyIds.has(reply.id)) {
              return { ...reply, reactions: existing.reactions, reactionCount: existing.reactionCount, currentUserReacted: existing.currentUserReacted };
            }
            return reply;
          });
          return { ...msg, replies: mergedReplies, replyCount: replies.length };
        })
      );
    });

    replyUnsubsRef.current.set(messageId, unsub);
  }, [enableReactions]);

  const unsubscribeFromReplies = useCallback((messageId: string) => {
    replyUnsubsRef.current.get(messageId)?.();
    replyUnsubsRef.current.delete(messageId);
  }, []);

  const loadMoreMessages = async () => {
    if (!lastDoc || !hasMore || loadingMore) return;

    setLoadingMore(true);

    try {
      const q = query(
        collection(db, 'messages'),
        orderBy('timestamp', 'desc'),
        startAfter(lastDoc),
        limit(MESSAGES_PER_PAGE)
      );

      const snapshot = await getDocs(q);

      if (snapshot.docs.length === 0) {
        setHasMore(false);
        setLoadingMore(false);
        return;
      }

      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === MESSAGES_PER_PAGE);

      const newMessagePromises = snapshot.docs.map(async (docSnapshot) => {
        const messageData = docSnapshot.data();
        const userData = await getUserData(messageData.userId);

        // Fetch full reactions (provides count + tooltip + user status)
        let reactions: Reaction[] = [];
        let reactionCount = 0;
        let currentUserReacted = false;
        if (enableReactions) {
          try {
            const reactionsSnap = await getDocs(
              collection(db, 'messages', docSnapshot.id, 'reactions')
            );
            reactions = reactionsSnap.docs.map(d => d.data() as Reaction);
            reactionCount = reactions.length;
            currentUserReacted = reactions.some(r => r.userId === auth.currentUser?.uid);
          } catch { /* ignore */ }
        }

        return {
          id: docSnapshot.id,
          text: messageData.text,
          userId: messageData.userId,
          timestamp: messageData.timestamp,
          lastActivityAt: messageData.lastActivityAt,
          username: userData.username,
          avatar: userData.avatar,
          reactions,
          reactionCount,
          currentUserReacted,
          replyCount: messageData.replyCount || 0,
          replies: [] as Reply[],
          editedAt: messageData.editedAt,
          imageId: messageData.imageId || undefined,
        } as Message;
      });

      const newMessages = await Promise.all(newMessagePromises);
      setMessages((prev) => [...prev, ...newMessages]);

    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSendMessage = async (text: string) => {
  if (!text.trim() && !pendingImage) return;
  if (!auth.currentUser) {
    alert('You must be logged in to send messages.');
    return;
  }

  // Check rate limit before sending
  if (!checkRateLimit()) {
    const remaining = getRemainingAttempts();
    alert(`You're posting too quickly! Please wait a few minutes before posting again.`);
    return;
  }

  setLoading(true);
  try {
    // Sanitize the message BEFORE saving to database
    const sanitizedText = sanitizeHtml(text.trim());

    // Check if sanitization removed everything (was all malicious code)
    if (!sanitizedText.trim() && !pendingImage) {
      alert('Your message contains invalid content. Please try again.');
      setLoading(false);
      return;
    }

    // Upload image if one is attached
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

    // Fetch username and avatar from cache or Firestore
    const userData = await getUserData(auth.currentUser.uid);

    const messageData: Record<string, any> = {
      text: sanitizedText,
      userId: auth.currentUser.uid,
      timestamp: serverTimestamp(),
      lastActivityAt: serverTimestamp(),
      username: userData.username,
      avatar: userData.avatar,
    };
    if (imageId) {
      messageData.imageId = imageId;
    }

    await addDoc(collection(db, 'messages'), messageData);

    setPendingImage(null);
    setNewMessage('');
  } catch (error) {
    console.error('Error sending message:', error);
    alert('Failed to send message. Please try again.');
  } finally {
    setLoading(false);
  }
};

  function handleInputChange(value: string) {
    const wordCount = value.trim().split(/\s+/).length;
    if (wordCount <= 250) {
      setNewMessage(value);
    }
  }

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '';
    try {
      return new Date(timestamp.seconds * 1000).toLocaleString();
    } catch (error) {
      return '';
    }
  };

  const handleToggleReaction = async (messageId: string) => {
    if (!auth.currentUser) {
      alert('You must be logged in to react to messages.');
      return;
    }

    // Use local state to determine current reaction status — no read needed
    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const reactionDocRef = doc(db, 'messages', messageId, 'reactions', auth.currentUser.uid);
    const messageRef = doc(db, 'messages', messageId);

    try {
      if (message.currentUserReacted) {
        // Optimistic update: remove from local array
        setMessages(prev =>
          prev.map(msg => {
            if (msg.id !== messageId) return msg;
            const newReactions = (msg.reactions || []).filter(r => r.userId !== auth.currentUser!.uid);
            return { ...msg, reactions: newReactions, reactionCount: newReactions.length, currentUserReacted: false };
          })
        );
        const removeBatch = writeBatch(db);
        removeBatch.delete(reactionDocRef);
        removeBatch.update(messageRef, { reactionCount: increment(-1) });
        await removeBatch.commit();
      } else {
        // Optimistic update: add to local array
        const userData = await getUserData(auth.currentUser.uid);
        const newReaction: Reaction = { userId: auth.currentUser.uid, username: userData.username, timestamp: null };
        setMessages(prev =>
          prev.map(msg => {
            if (msg.id !== messageId) return msg;
            const newReactions = [...(msg.reactions || []), newReaction];
            return { ...msg, reactions: newReactions, reactionCount: newReactions.length, currentUserReacted: true };
          })
        );
        const addBatch = writeBatch(db);
        addBatch.set(reactionDocRef, {
          userId: auth.currentUser.uid,
          username: userData.username,
          timestamp: serverTimestamp(),
        });
        addBatch.update(messageRef, { reactionCount: increment(1) });
        await addBatch.commit();
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
      alert('Failed to update reaction. Please try again.');
    }
  };

  const handleToggleReplies = (messageId: string) => {
    setExpandedReplies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
        unsubscribeFromReplies(messageId);
      } else {
        newSet.add(messageId);
        if (enableReplies) {
          subscribeToReplies(messageId);
        }
      }
      return newSet;
    });
  };

  const handleOpenReplyInput = (messageId: string) => {
    setActiveReplyInput(messageId);
    // Also expand replies when opening reply input
    setExpandedReplies((prev) => {
      const newSet = new Set(prev);
      if (!newSet.has(messageId)) {
        newSet.add(messageId);
        if (enableReplies) {
          subscribeToReplies(messageId);
        }
      }
      return newSet;
    });
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

      // Upload image if attached
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

      // Fetch username and avatar from cache
      const userData = await getUserData(auth.currentUser.uid);

      const replyData: Record<string, any> = {
        text: sanitizedText,
        userId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        username: userData.username,
        avatar: userData.avatar,
      };
      if (imageId) {
        replyData.imageId = imageId;
      }

      // Optimistic UI update: increment reply count immediately
      setMessages(prev =>
        prev.map(msg => {
          if (msg.id !== messageId) return msg;
          return { ...msg, replyCount: (msg.replyCount || 0) + 1 };
        })
      );

      // Create reply doc first (addDoc can't be batched), then atomically update parent
      await addDoc(collection(db, 'messages', messageId, 'replies'), replyData);

      // Batch the parent message updates so replyCount + lastActivityAt are atomic
      const batch = writeBatch(db);
      const messageRef = doc(db, 'messages', messageId);
      batch.update(messageRef, {
        lastActivityAt: serverTimestamp(),
        replyCount: increment(1),
      });
      await batch.commit();

      // Close reply input after sending
      setActiveReplyInput(null);
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

    // Use local state to determine current reaction status — no read needed
    const message = messages.find(m => m.id === messageId);
    const reply = message?.replies?.find(r => r.id === replyId);
    if (!message || !reply) return;

    const reactionDocRef = doc(db, 'messages', messageId, 'replies', replyId, 'reactions', auth.currentUser.uid);
    const replyRef = doc(db, 'messages', messageId, 'replies', replyId);

    try {
      if (reply.currentUserReacted) {
        // Optimistic update: remove from local array
        setMessages(prev =>
          prev.map(msg => {
            if (msg.id !== messageId) return msg;
            return {
              ...msg,
              replies: msg.replies?.map(r => {
                if (r.id !== replyId) return r;
                const newReactions = (r.reactions || []).filter(rx => rx.userId !== auth.currentUser!.uid);
                return { ...r, reactions: newReactions, reactionCount: newReactions.length, currentUserReacted: false };
              }),
            };
          })
        );
        const removeBatch = writeBatch(db);
        removeBatch.delete(reactionDocRef);
        removeBatch.update(replyRef, { reactionCount: increment(-1) });
        await removeBatch.commit();
      } else {
        // Optimistic update: add to local array
        const userData = await getUserData(auth.currentUser.uid);
        const newReaction: Reaction = { userId: auth.currentUser.uid, username: userData.username, timestamp: null };
        setMessages(prev =>
          prev.map(msg => {
            if (msg.id !== messageId) return msg;
            return {
              ...msg,
              replies: msg.replies?.map(r => {
                if (r.id !== replyId) return r;
                const newReactions = [...(r.reactions || []), newReaction];
                return { ...r, reactions: newReactions, reactionCount: newReactions.length, currentUserReacted: true };
              }),
            };
          })
        );
        const addBatch = writeBatch(db);
        addBatch.set(reactionDocRef, {
          userId: auth.currentUser.uid,
          username: userData.username,
          timestamp: serverTimestamp(),
        });
        addBatch.update(replyRef, { reactionCount: increment(1) });
        await addBatch.commit();
      }
    } catch (error) {
      console.error('Error toggling reaction on reply:', error);
      alert('Failed to update reaction. Please try again.');
    }
  };

  const handleEditMessage = async (messageId: string, newText: string) => {
    if (!auth.currentUser) return;

    try {
      const messageRef = doc(db, 'messages', messageId);
      await updateDoc(messageRef, {
        text: newText,
        editedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error editing message:', error);
      alert('Failed to edit message. Please try again.');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!auth.currentUser) return;

    try {
      const messageRef = doc(db, 'messages', messageId);
      await deleteDoc(messageRef);
    } catch (error) {
      console.error('Error deleting message:', error);
      alert('Failed to delete message. Please try again.');
    }
  };

  const handleEditReply = async (messageId: string, replyId: string, newText: string) => {
    if (!auth.currentUser) return;

    try {
      const replyRef = doc(db, 'messages', messageId, 'replies', replyId);
      await updateDoc(replyRef, {
        text: newText,
        editedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error editing reply:', error);
      alert('Failed to edit reply. Please try again.');
    }
  };

  const handleDeleteReply = async (messageId: string, replyId: string) => {
    if (!auth.currentUser) return;

    try {
      // Optimistic UI update: decrement reply count immediately
      setMessages(prev =>
        prev.map(msg => {
          if (msg.id !== messageId) return msg;
          return {
            ...msg,
            replyCount: Math.max(0, (msg.replyCount || 0) - 1),
            replies: msg.replies?.filter(r => r.id !== replyId),
          };
        })
      );

      const replyRef = doc(db, 'messages', messageId, 'replies', replyId);
      const messageRef = doc(db, 'messages', messageId);

      // Delete reply first, then atomically decrement the parent count
      await deleteDoc(replyRef);
      const batch = writeBatch(db);
      batch.update(messageRef, { replyCount: increment(-1) });
      await batch.commit();
    } catch (error) {
      console.error('Error deleting reply:', error);
      alert('Failed to delete reply. Please try again.');
    }
  };

  return (
    <div className="message-board-container">
      <div style={{
        marginBottom: '16px',
        padding: '12px',
        borderRadius: '8px',
        fontSize: '14px',
        color: 'var(--colour2)',
        fontStyle: 'italic',
        textAlign: 'center'
      }}>
        💡 <strong>Tip:</strong> Type <code>@</code> to tag artists/albums or <code>#</code> to tag lists in your messages!
      </div>
      <ForumBox onSend={handleSendMessage} disabled={loading} onImageAttach={setPendingImage} />
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
            onClose={() => {}}
            hideCloseButton={true}
            reactions={enableReactions ? message.reactions : undefined}
            reactionCount={enableReactions ? message.reactionCount : undefined}
            currentUserReacted={enableReactions ? message.currentUserReacted : undefined}
            onToggleReaction={enableReactions ? () => handleToggleReaction(message.id) : undefined}
            replies={enableReplies ? message.replies : undefined}
            replyCount={enableReplies ? message.replyCount : undefined}
            onReply={enableReplies ? (text: string, image?: File | null) => handleSendReply(message.id, text, image) : undefined}
            onToggleReplies={enableReplies ? () => handleToggleReplies(message.id) : undefined}
            repliesExpanded={enableReplies ? expandedReplies.has(message.id) : undefined}
            onToggleReplyReaction={enableReplies && enableReactions ? (replyId: string) => handleToggleReplyReaction(message.id, replyId) : undefined}
            replyingToUsername={message.username}
            enableReplies={enableReplies}
          />
        ))}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: '20px',
          marginBottom: '20px'
        }}>
          <Button
            type="basic"
            label={loadingMore ? 'Loading...' : 'Load More Messages'}
            onClick={loadMoreMessages}
            disabled={loadingMore}
          />
        </div>
      )}

      {!hasMore && messages.length > 0 && (
        <div style={{
          textAlign: 'center',
          padding: '20px',
          color: 'var(--colour4)',
          fontStyle: 'italic'
        }}>
          No more messages to load
        </div>
      )}
    </div>
  );
};

export default MessageBoard;
