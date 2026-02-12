import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, query, onSnapshot, orderBy, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp, limit, startAfter, QueryDocumentSnapshot } from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { sanitizeHtml } from '../utils/sanitise';
import UserMessage from './basic/UserMessages';
import './MessageBoard.css';
import ForumBox from './basic/ForumMessageBox';
import Button from './basic/Button';
import { useRateLimit } from '../utils/useRateLimit';

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
}

interface Message {
  id: string;
  text: string;
  userId: string;
  timestamp: any;
  username: string;
  avatar: string;
  reactions?: Reaction[];
  reactionCount?: number;
  currentUserReacted?: boolean;
  replies?: Reply[];
  replyCount?: number;
}

interface MessageBoardProps {
  enableReactions?: boolean;
  enableReplies?: boolean;
}

const MESSAGES_PER_PAGE = 20;

const MessageBoard: React.FC<MessageBoardProps> = ({ enableReactions = false, enableReplies = false }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [activeReplyInput, setActiveReplyInput] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Rate limiting: 10 messages per 5 minutes
  const { checkRateLimit, getRemainingAttempts } = useRateLimit({
    maxAttempts: 10,
    windowMs: 5 * 60 * 1000, // 5 minutes
  });

  // Cache for user profiles to avoid redundant fetches
  // Cache expires after 5 minutes to allow profile updates to show
  const userCacheRef = useRef<Map<string, {
    username: string;
    avatar: string;
    timestamp: number
  }>>(new Map());

  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

  // Helper function to get user data (with caching and expiration)
  const getUserData = async (userId: string): Promise<{ username: string; avatar: string }> => {
    const now = Date.now();
    const cached = userCacheRef.current.get(userId);
    
    // Check if cache exists and is still fresh (less than 5 minutes old)
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      return { username: cached.username, avatar: cached.avatar };
    }

    // Fetch from Firestore if not cached or cache expired
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userDocRef);
      let userData: { username: string; avatar: string };
      
      if (userDoc.exists()) {
        const data = userDoc.data();
        userData = {
          username: data.username || 'Anonymous',
          avatar: data.avatar || ''
        };
      } else {
        userData = { username: 'Anonymous', avatar: '' };
      }
      
      // Cache the result with current timestamp
      userCacheRef.current.set(userId, {
        ...userData,
        timestamp: now
      });
      
      return userData;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      const fallback = { username: 'Anonymous', avatar: '' };
      userCacheRef.current.set(userId, {
        ...fallback,
        timestamp: now
      });
      return fallback;
    }
  };

  useEffect(() => {
    loadInitialMessages();
    
    // Cleanup function
    return () => {
      // Clean up listeners if needed
    };
  }, [enableReactions, enableReplies]);

  const loadInitialMessages = async () => {
    const q = query(
      collection(db, 'messages'), 
      orderBy('timestamp', 'desc'),
      limit(MESSAGES_PER_PAGE)
    );
    
    const unsubscribeMessages = onSnapshot(q, async (snapshot) => {
      try {
        const reactionUnsubscribers: (() => void)[] = [];

        // Store last document for pagination
        if (snapshot.docs.length > 0) {
          setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
          setHasMore(snapshot.docs.length === MESSAGES_PER_PAGE);
        } else {
          setHasMore(false);
        }

        const messagePromises = snapshot.docs.map(async (docSnapshot) => {
          const messageData = docSnapshot.data();
          
          // Fetch CURRENT user profile data (with caching)
          // This ensures we always show the latest username/avatar
          const userData = await getUserData(messageData.userId);

          return {
            id: docSnapshot.id,
            text: messageData.text,
            userId: messageData.userId,
            timestamp: messageData.timestamp,
            username: userData.username,
            avatar: userData.avatar,
            reactions: [] as Reaction[],
            reactionCount: 0,
            currentUserReacted: false,
            replies: [] as Reply[],
            replyCount: 0,
          };
        });

        const initialMessages = await Promise.all(messagePromises);
        setMessages(initialMessages);

        // Set up real-time listeners for reactions if enabled
        if (enableReactions) {
          snapshot.docs.forEach((docSnapshot) => {
            const messageId = docSnapshot.id;
            const reactionsCollectionRef = collection(db, 'messages', messageId, 'reactions');

            const unsubscribeReactions = onSnapshot(reactionsCollectionRef, (reactionsSnapshot) => {
              const reactions = reactionsSnapshot.docs.map((reactionDoc) => reactionDoc.data() as Reaction);
              const reactionCount = reactions.length;
              const currentUserReacted = reactions.some(r => r.userId === auth.currentUser?.uid);

              setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                  msg.id === messageId
                    ? { ...msg, reactions, reactionCount, currentUserReacted }
                    : msg
                )
              );
            });

            reactionUnsubscribers.push(unsubscribeReactions);
          });
        }

        // Set up real-time listeners for replies if enabled
        if (enableReplies) {
          snapshot.docs.forEach((docSnapshot) => {
            const messageId = docSnapshot.id;
            const repliesCollectionRef = collection(db, 'messages', messageId, 'replies');
            const repliesQuery = query(repliesCollectionRef, orderBy('timestamp', 'asc'));

            const unsubscribeReplies = onSnapshot(repliesQuery, async (repliesSnapshot) => {
              const replyReactionUnsubscribers: (() => void)[] = [];

              const replyPromises = repliesSnapshot.docs.map(async (replyDoc) => {
                const replyData = replyDoc.data();
                
                // Fetch CURRENT user profile data for reply authors
                const userData = await getUserData(replyData.userId);

                return {
                  id: replyDoc.id,
                  text: replyData.text,
                  userId: replyData.userId,
                  timestamp: replyData.timestamp,
                  username: userData.username,
                  avatar: userData.avatar,
                  reactions: [] as Reaction[],
                  reactionCount: 0,
                  currentUserReacted: false,
                };
              });

              const replies = await Promise.all(replyPromises);
              const replyCount = replies.length;

              setMessages((prevMessages) =>
                prevMessages.map((msg) =>
                  msg.id === messageId
                    ? { ...msg, replies, replyCount }
                    : msg
                )
              );

              // Set up real-time listeners for reactions on replies
              if (enableReactions) {
                repliesSnapshot.docs.forEach((replyDoc) => {
                  const replyId = replyDoc.id;
                  const replyReactionsCollectionRef = collection(db, 'messages', messageId, 'replies', replyId, 'reactions');

                  const unsubscribeReplyReactions = onSnapshot(replyReactionsCollectionRef, (replyReactionsSnapshot) => {
                    const replyReactions = replyReactionsSnapshot.docs.map((reactionDoc) => reactionDoc.data() as Reaction);
                    const replyReactionCount = replyReactions.length;
                    const currentUserReactedToReply = replyReactions.some(r => r.userId === auth.currentUser?.uid);

                    setMessages((prevMessages) =>
                      prevMessages.map((msg) =>
                        msg.id === messageId
                          ? {
                              ...msg,
                              replies: msg.replies?.map((reply) =>
                                reply.id === replyId
                                  ? { ...reply, reactions: replyReactions, reactionCount: replyReactionCount, currentUserReacted: currentUserReactedToReply }
                                  : reply
                              ),
                            }
                          : msg
                      )
                    );
                  });

                  replyReactionUnsubscribers.push(unsubscribeReplyReactions);
                });
              }

              // Store cleanup functions for reply reactions
              reactionUnsubscribers.push(...replyReactionUnsubscribers);
            });

            reactionUnsubscribers.push(unsubscribeReplies);
          });
        }

        // Return cleanup function
        return () => {
          reactionUnsubscribers.forEach(unsub => unsub());
        };
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    });

    return () => {
      unsubscribeMessages();
    };
  };

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

      // Update last document
      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === MESSAGES_PER_PAGE);

      const reactionUnsubscribers: (() => void)[] = [];

      const newMessagePromises = snapshot.docs.map(async (docSnapshot) => {
        const messageData = docSnapshot.data();
        
        // Fetch CURRENT user profile data
        const userData = await getUserData(messageData.userId);

        return {
          id: docSnapshot.id,
          text: messageData.text,
          userId: messageData.userId,
          timestamp: messageData.timestamp,
          username: userData.username,
          avatar: userData.avatar,
          reactions: [] as Reaction[],
          reactionCount: 0,
          currentUserReacted: false,
          replies: [] as Reply[],
          replyCount: 0,
        };
      });

      const newMessages = await Promise.all(newMessagePromises);

      // Set up listeners for the new messages
      if (enableReactions) {
        snapshot.docs.forEach((docSnapshot) => {
          const messageId = docSnapshot.id;
          const reactionsCollectionRef = collection(db, 'messages', messageId, 'reactions');

          const unsubscribeReactions = onSnapshot(reactionsCollectionRef, (reactionsSnapshot) => {
            const reactions = reactionsSnapshot.docs.map((reactionDoc) => reactionDoc.data() as Reaction);
            const reactionCount = reactions.length;
            const currentUserReacted = reactions.some(r => r.userId === auth.currentUser?.uid);

            setMessages((prevMessages) =>
              prevMessages.map((msg) =>
                msg.id === messageId
                  ? { ...msg, reactions, reactionCount, currentUserReacted }
                  : msg
              )
            );
          });

          reactionUnsubscribers.push(unsubscribeReactions);
        });
      }

      if (enableReplies) {
        snapshot.docs.forEach((docSnapshot) => {
          const messageId = docSnapshot.id;
          const repliesCollectionRef = collection(db, 'messages', messageId, 'replies');
          const repliesQuery = query(repliesCollectionRef, orderBy('timestamp', 'asc'));

          const unsubscribeReplies = onSnapshot(repliesQuery, async (repliesSnapshot) => {
            const replyReactionUnsubscribers: (() => void)[] = [];

            const replyPromises = repliesSnapshot.docs.map(async (replyDoc) => {
              const replyData = replyDoc.data();
              
              // Fetch CURRENT user profile data for replies
              const userData = await getUserData(replyData.userId);

              return {
                id: replyDoc.id,
                text: replyData.text,
                userId: replyData.userId,
                timestamp: replyData.timestamp,
                username: userData.username,
                avatar: userData.avatar,
                reactions: [] as Reaction[],
                reactionCount: 0,
                currentUserReacted: false,
              };
            });

            const replies = await Promise.all(replyPromises);
            const replyCount = replies.length;

            setMessages((prevMessages) =>
              prevMessages.map((msg) =>
                msg.id === messageId
                  ? { ...msg, replies, replyCount }
                  : msg
              )
            );

            if (enableReactions) {
              repliesSnapshot.docs.forEach((replyDoc) => {
                const replyId = replyDoc.id;
                const replyReactionsCollectionRef = collection(db, 'messages', messageId, 'replies', replyId, 'reactions');

                const unsubscribeReplyReactions = onSnapshot(replyReactionsCollectionRef, (replyReactionsSnapshot) => {
                  const replyReactions = replyReactionsSnapshot.docs.map((reactionDoc) => reactionDoc.data() as Reaction);
                  const replyReactionCount = replyReactions.length;
                  const currentUserReactedToReply = replyReactions.some(r => r.userId === auth.currentUser?.uid);

                  setMessages((prevMessages) =>
                    prevMessages.map((msg) =>
                      msg.id === messageId
                        ? {
                            ...msg,
                            replies: msg.replies?.map((reply) =>
                              reply.id === replyId
                                ? { ...reply, reactions: replyReactions, reactionCount: replyReactionCount, currentUserReacted: currentUserReactedToReply }
                                : reply
                            ),
                          }
                        : msg
                    )
                  );
                });

                replyReactionUnsubscribers.push(unsubscribeReplyReactions);
              });
            }

            reactionUnsubscribers.push(...replyReactionUnsubscribers);
          });

          reactionUnsubscribers.push(unsubscribeReplies);
        });
      }

      // Append new messages to existing ones
      setMessages((prev) => [...prev, ...newMessages]);

    } catch (error) {
      console.error('Error loading more messages:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSendMessage = async (text: string) => {
  if (!text.trim()) return;
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
    if (!sanitizedText.trim()) {
      alert('Your message contains invalid content. Please try again.');
      setLoading(false);
      return;
    }

    // Fetch username and avatar from cache or Firestore
    const userData = await getUserData(auth.currentUser.uid);

    await addDoc(collection(db, 'messages'), {
      text: sanitizedText, 
      userId: auth.currentUser.uid,
      timestamp: serverTimestamp(),
      username: userData.username,
      avatar: userData.avatar,
    });
    
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

    const reactionDocRef = doc(db, 'messages', messageId, 'reactions', auth.currentUser.uid);

    try {
      const reactionDoc = await getDoc(reactionDocRef);

      if (reactionDoc.exists()) {
        // Remove reaction
        await deleteDoc(reactionDocRef);
      } else {
        // Fetch username from cache
        const userData = await getUserData(auth.currentUser.uid);

        // Add reaction
        await setDoc(reactionDocRef, {
          userId: auth.currentUser.uid,
          username: userData.username,
          timestamp: serverTimestamp(),
        });
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
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const handleOpenReplyInput = (messageId: string) => {
    setActiveReplyInput(messageId);
    // Also expand replies when opening reply input
    setExpandedReplies((prev) => {
      const newSet = new Set(prev);
      newSet.add(messageId);
      return newSet;
    });
  };

  const handleSendReply = async (messageId: string, text: string) => {
    if (!text.trim()) return;
    if (!auth.currentUser) {
      alert('You must be logged in to send replies.');
      return;
    }

    try {
      const sanitizedText = sanitizeHtml(text.trim());

    if (!sanitizedText.trim()) {
      alert('Your reply contains invalid content. Please try again.');
      return;
    }
      // Fetch username and avatar from cache
      const userData = await getUserData(auth.currentUser.uid);

      await addDoc(collection(db, 'messages', messageId, 'replies'), {
        text: sanitizedText,
        userId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        username: userData.username,
        avatar: userData.avatar,
      });
      
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

    const reactionDocRef = doc(db, 'messages', messageId, 'replies', replyId, 'reactions', auth.currentUser.uid);

    try {
      const reactionDoc = await getDoc(reactionDocRef);

      if (reactionDoc.exists()) {
        // Remove reaction
        await deleteDoc(reactionDocRef);
      } else {
        // Fetch username from cache
        const userData = await getUserData(auth.currentUser.uid);

        // Add reaction
        await setDoc(reactionDocRef, {
          userId: auth.currentUser.uid,
          username: userData.username,
          timestamp: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('Error toggling reaction on reply:', error);
      alert('Failed to update reaction. Please try again.');
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
      <ForumBox onSend={handleSendMessage} disabled={loading} />
      <div className="messages-container">
        {messages.map((message) => (
          <UserMessage
            key={message.id}
            username={message.username || 'Anonymous'}
            message={message.text}
            timestamp={formatTimestamp(message.timestamp)}
            userSticker={message.avatar || 'default-avatar.png'}
            onClose={() => {}}
            hideCloseButton={true}
            reactions={enableReactions ? message.reactions : undefined}
            reactionCount={enableReactions ? message.reactionCount : undefined}
            currentUserReacted={enableReactions ? message.currentUserReacted : undefined}
            onToggleReaction={enableReactions ? () => handleToggleReaction(message.id) : undefined}
            replies={enableReplies ? message.replies : undefined}
            replyCount={enableReplies ? message.replyCount : undefined}
            onReply={enableReplies ? (text: string) => handleSendReply(message.id, text) : undefined}
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