import React, { useState, useEffect } from 'react';
import { collection, addDoc, query, onSnapshot, orderBy, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import TextBox from './basic/MessageTextBox';
import UserMessage from './basic/UserMessages';
import './MessageBoard.css';
import ForumBox from './basic/ForumMessageBox';

interface Message {
  id: string;
  text: string;
  userId: string;
  timestamp: any;
  username: string;
  avatar: string;
}

const MessageBoard: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchMessages = async () => {
      const q = query(collection(db, 'messages'), orderBy('timestamp', 'desc'));
      const unsubscribe = onSnapshot(q, async (snapshot) => {
        try {
          const userCache = new Map<string, { username: string; avatar: string }>();

          const fetchedMessages = await Promise.all(
            snapshot.docs.map(async (docSnapshot) => {
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
              };
            })
          );

          setMessages(fetchedMessages);
        } catch (error) {
          console.error('Error fetching messages:', error);
        }
      });

      return () => unsubscribe();
    };

    fetchMessages();
  }, []);

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'messages'), {
        text: text,
        userId: auth.currentUser?.uid,
        timestamp: serverTimestamp(),
        username: auth.currentUser?.displayName || 'Anonymous',
        avatar: auth.currentUser?.photoURL || '',
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

  return (
    <div className="message-board-container">
      <ForumBox/>
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
          />
        ))}
      </div>
    </div>
  );
};

export default MessageBoard;