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
}

interface MessageBoardProps {
  enableReactions?: boolean;
}

const MessageBoard: React.FC<MessageBoardProps> = ({ enableReactions = false }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);

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
  }, [enableReactions]);

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

  return (
    <div className="message-board-container">
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
          />
        ))}
      </div>
    </div>
  );
};

export default MessageBoard;