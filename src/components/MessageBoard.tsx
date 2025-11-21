import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, onSnapshot, orderBy, doc, getDoc, getDocs, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import UserMessage from './basic/UserMessages';
import './MessageBoard.css';
import ForumBox from './basic/ForumMessageBox';

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

const MessageBoard: React.FC<MessageBoardProps> = ({ enableReactions = false, enableReplies = false }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [activeReplyInput, setActiveReplyInput] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'desc'));
    const unsubscribeMessages = onSnapshot(q, async (snapshot) => {
      try {
        const userCache = new Map<string, { username: string; avatar: string }>();
        const reactionUnsubscribers: (() => void)[] = [];

        const messagePromises = snapshot.docs.map(async (docSnapshot) => {
          const messageData = docSnapshot.data();
          const userId = messageData.userId;

          let userData = userCache.get(userId);
          if (!userData) {
            try {
              const userDocRef = doc(db, 'users', userId);
              const userDoc = await getDoc(userDocRef);
              if (userDoc.exists()) {
                userData = userDoc.data() as { username: string; avatar: string };
              } else {
                userData = { username: 'Anonymous', avatar: '' };
              }
              userCache.set(userId, userData);
            } catch (error) {
              console.error('Error fetching user profile:', error);
              userData = { username: 'Anonymous', avatar: '' };
            }
          }

          return {
            id: docSnapshot.id,
            text: messageData.text,
            userId,
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
                const replyUserId = replyData.userId;

                let replyUserData = userCache.get(replyUserId);
                if (!replyUserData) {
                  try {
                    const userDocRef = doc(db, 'users', replyUserId);
                    const userDoc = await getDoc(userDocRef);
                    if (userDoc.exists()) {
                      replyUserData = userDoc.data() as { username: string; avatar: string };
                    } else {
                      replyUserData = { username: 'Anonymous', avatar: '' };
                    }
                    userCache.set(replyUserId, replyUserData);
                  } catch (error) {
                    console.error('Error fetching user profile for reply:', error);
                    replyUserData = { username: 'Anonymous', avatar: '' };
                  }
                }

                return {
                  id: replyDoc.id,
                  text: replyData.text,
                  userId: replyUserId,
                  timestamp: replyData.timestamp,
                  username: replyUserData.username,
                  avatar: replyUserData.avatar,
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
  }, [enableReactions, enableReplies]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;
    if (!auth.currentUser) {
      alert('You must be logged in to send messages.');
      return;
    }

    setLoading(true);
    try {
      // Fetch username and avatar from Firestore users collection
      let username = 'Anonymous';
      let avatar = '';

      try {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          username = userData.username || 'Anonymous';
          avatar = userData.avatar || '';
        }
      } catch (error) {
        console.error('Error fetching user profile for message:', error);
      }

      await addDoc(collection(db, 'messages'), {
        text: text,
        userId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        username: username,
        avatar: avatar,
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (value: string) => {
    const wordCount = value.trim().split(/\s+/).length;
    if (wordCount <= 250) {
      setNewMessage(value);
    }
  };

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
        // Fetch username from Firestore users collection
        let username = 'Anonymous';
        try {
          const userDocRef = doc(db, 'users', auth.currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            username = userDoc.data().username || 'Anonymous';
          }
        } catch (error) {
          console.error('Error fetching user profile for reaction:', error);
        }

        // Add reaction
        await setDoc(reactionDocRef, {
          userId: auth.currentUser.uid,
          username: username,
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
      // Fetch username and avatar from Firestore users collection
      let username = 'Anonymous';
      let avatar = '';

      try {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          username = userData.username || 'Anonymous';
          avatar = userData.avatar || '';
        }
      } catch (error) {
        console.error('Error fetching user profile for reply:', error);
      }

      await addDoc(collection(db, 'messages', messageId, 'replies'), {
        text: text,
        userId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        username: username,
        avatar: avatar,
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
        // Fetch username from Firestore users collection
        let username = 'Anonymous';
        try {
          const userDocRef = doc(db, 'users', auth.currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            username = userDoc.data().username || 'Anonymous';
          }
        } catch (error) {
          console.error('Error fetching user profile for reaction:', error);
        }

        // Add reaction
        await setDoc(reactionDocRef, {
          userId: auth.currentUser.uid,
          username: username,
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
            userSticker={message.avatar || 'default-avatar.png'} // Using avatar as userSticker
            onClose={() => {}} // Empty function since we don't want close functionality for message board
            hideCloseButton={true} // Hide the close button for message board messages
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
    </div>
  );
};

export default MessageBoard;