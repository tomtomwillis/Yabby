import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, orderBy, getDocs, deleteDoc, updateDoc, addDoc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import Header from '../components/basic/Header';
import ListItem from '../components/ListItem';
import CreateList from '../components/CreateList';
import Button from '../components/basic/Button';
import UserMessage from '../components/basic/UserMessages';
import ForumBox from '../components/basic/ForumMessageBox';

interface Reaction {
  userId: string;
  username: string;
  timestamp: any;
}

interface Comment {
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

interface List {
  id: string;
  title: string;
  userId: string;
  username: string;
  timestamp: any;
  itemCount: number;
  isPublic?: boolean;
  isCommunal?: boolean;
  contributors?: string[];
  contributorUsernames?: { [uid: string]: string };
  items?: any[];
  comments?: Comment[];
  commentCount?: number;
}

const ListDetailPage: React.FC = () => {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const [list, setList] = useState<List | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [commentLoading, setCommentLoading] = useState(false);

  useEffect(() => {
    if (listId) {
      loadList();
      loadComments();
    }
  }, [listId]);

  const loadList = async () => {
    if (!listId) return;

    setLoading(true);
    setError(null);

    try {
      // Load main list document
      const listDocRef = doc(db, 'lists', listId);
      const listDoc = await getDoc(listDocRef);

      if (!listDoc.exists()) {
        setError('List not found');
        return;
      }

      const listData = { id: listDoc.id, ...listDoc.data() } as List;
      setList(listData);

      // Load list items
      const itemsQuery = query(
        collection(db, 'lists', listId, 'items'),
        orderBy('order', 'asc')
      );

      const itemsSnapshot = await getDocs(itemsQuery);
      const itemsData: any[] = [];

      itemsSnapshot.forEach((doc) => {
        itemsData.push({ id: doc.id, ...doc.data() });
      });

      setItems(itemsData);
    } catch (error) {
      console.error('Error loading list:', error);
      setError('Failed to load list');
    } finally {
      setLoading(false);
    }
  };

  const loadComments = () => {
    if (!listId) return;

    const commentsQuery = query(
      collection(db, 'lists', listId, 'comments'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(commentsQuery, async (snapshot) => {
      try {
        const userCache = new Map<string, { username: string; avatar: string }>();
        const reactionUnsubscribers: (() => void)[] = [];

        const commentPromises = snapshot.docs.map(async (docSnapshot) => {
          const commentData = docSnapshot.data();
          const userId = commentData.userId;

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

          let comment: Comment = {
            id: docSnapshot.id,
            ...commentData,
            username: userData.username,
            avatar: userData.avatar,
          } as Comment;

          // Load reactions for this comment
          const reactionsQuery = query(collection(db, 'lists', listId, 'comments', comment.id, 'reactions'));
          const unsubscribeReactions = onSnapshot(reactionsQuery, (reactionsSnapshot) => {
            const reactions: Reaction[] = [];
            reactionsSnapshot.forEach((reactionDoc) => {
              reactions.push(reactionDoc.data() as Reaction);
            });

            const reactionCount = reactions.length;
            const currentUserReacted = auth.currentUser ? 
              reactions.some(r => r.userId === auth.currentUser!.uid) : false;

            setComments(prevComments => 
              prevComments.map(c => 
                c.id === comment.id 
                  ? { ...c, reactions, reactionCount, currentUserReacted }
                  : c
              )
            );
          });

          reactionUnsubscribers.push(unsubscribeReactions);
          return comment;
        });

        const resolvedComments = await Promise.all(commentPromises);
        setComments(resolvedComments);

        return () => {
          reactionUnsubscribers.forEach(unsub => unsub());
        };
      } catch (error) {
        console.error('Error fetching comments:', error);
      }
    });

    return () => {
      unsubscribe();
    };
  };

  const handleSendComment = async (text: string) => {
    if (!text.trim() || !auth.currentUser || !listId) return;
    
    setCommentLoading(true);
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
        console.error('Error fetching user profile for comment:', error);
      }

      await addDoc(collection(db, 'lists', listId, 'comments'), {
        text: text,
        userId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        username: username,
        avatar: avatar,
      });
    } catch (error) {
      console.error('Error sending comment:', error);
      alert('Failed to send comment. Please try again.');
    } finally {
      setCommentLoading(false);
    }
  };

  const handleToggleCommentReaction = async (commentId: string) => {
    if (!auth.currentUser || !listId) {
      alert('You must be logged in to react to comments.');
      return;
    }

    const reactionDocRef = doc(db, 'lists', listId, 'comments', commentId, 'reactions', auth.currentUser.uid);

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
      console.error('Error toggling reaction on comment:', error);
      alert('Failed to update reaction. Please try again.');
    }
  };

  // Handle item editing
  const handleEditItem = async (itemId: string, itemIndex: number) => {
    if (!list || !itemId) return;
    
    const newText = prompt('Edit item description:', items[itemIndex]?.userText || '');
    if (newText === null) return; // User cancelled
    
    try {
      await updateDoc(doc(db, 'lists', list.id, 'items', itemId), {
        userText: newText.trim(),
        timestamp: serverTimestamp()
      });
      
      // Update local state
      const updatedItems = [...items];
      updatedItems[itemIndex] = { ...updatedItems[itemIndex], userText: newText.trim() };
      setItems(updatedItems);
    } catch (error) {
      console.error('Error updating item:', error);
      alert('Failed to update item. Please try again.');
    }
  };

  // Handle item deletion
  const handleDeleteItem = async (itemId: string, itemIndex: number) => {
    if (!list || !itemId) return;
    
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    try {
      await deleteDoc(doc(db, 'lists', list.id, 'items', itemId));
      
      // Update local state
      const updatedItems = items.filter((_, index) => index !== itemIndex);
      setItems(updatedItems);
      
      // Update list item count
      await updateDoc(doc(db, 'lists', list.id), {
        itemCount: updatedItems.length
      });
    } catch (error) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item. Please try again.');
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

  const handleDeleteList = async () => {
    if (!list || !auth.currentUser) return;

    if (list.userId !== auth.currentUser.uid) {
      alert('You can only delete your own lists');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${list.title}"?`)) {
      return;
    }

    try {
      // Delete all items first
      const itemsQuery = query(collection(db, 'lists', list.id, 'items'));
      const itemsSnapshot = await getDocs(itemsQuery);
      
      for (const itemDoc of itemsSnapshot.docs) {
        await deleteDoc(itemDoc.ref);
      }

      // Delete the main list document
      await deleteDoc(doc(db, 'lists', list.id));

      alert('List deleted successfully!');
      navigate('/lists');
    } catch (error) {
      console.error('Error deleting list:', error);
      alert('Failed to delete list. Please try again.');
    }
  };

  const handleEditComplete = () => {
    setIsEditing(false);
    loadList(); // Reload the list to show updated data
  };

  const canEdit = auth.currentUser && list && list.userId === auth.currentUser.uid;

  if (loading) {
    return (
      <div>
        <Header title="List" subtitle="Loading..." />
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '200px',
          color: 'var(--colour4)'
        }}>
          Loading list...
        </div>
      </div>
    );
  }

  if (error || !list) {
    return (
      <div>
        <Header title="List" subtitle="Error" />
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          justifyContent: 'center', 
          alignItems: 'center', 
          height: '200px',
          color: 'var(--colour4)',
          gap: '16px'
        }}>
          <div>{error || 'List not found'}</div>
          <Button 
            onClick={() => navigate('/lists')} 
            label="← Back to Lists" 
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <style>
        {`
          @media (max-width: 768px) {
            .list-item-container {
              flex-direction: column !important;
              align-items: center !important;
            }
            .list-item-number {
              margin-bottom: 12px !important;
            }
            .list-item-content {
              width: 100% !important;
            }
          }
        `}
      </style>
      <Header title="Lists" subtitle="View List" />
      
      {isEditing ? (
        <div style={{ padding: '20px' }}>
          <div style={{ marginBottom: '20px' }}>
            <Button 
              onClick={() => setIsEditing(false)} 
              label="← Cancel Edit" 
            />
          </div>
          <CreateList
            editMode={true}
            existingListId={list.id}
            existingList={list}
            onListCreated={handleEditComplete}
          />
        </div>
      ) : (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
          {/* Header Section */}
          <div style={{ marginBottom: '30px' }}>
            <div style={{ marginBottom: '16px' }}>
              <Button 
                onClick={() => navigate('/lists')} 
                label="← Back to Lists" 
              />
            </div>
            
            <h1 style={{ 
              color: 'var(--colour2)', 
              fontFamily: 'var(--font2)', 
              marginBottom: '8px',
              fontSize: '2em'
            }}>
              {list.title}
            </h1>
            
            <div style={{ 
              color: 'var(--colour2)', 
              opacity: 0.8,
              marginBottom: '16px'
            }}>
              By {list.username} • {items.length} item{items.length !== 1 ? 's' : ''}
              {list.timestamp && (
                <> • {new Date(list.timestamp.seconds * 1000).toLocaleDateString()}</>
              )}
            </div>

            {/* Action Buttons */}
            {canEdit && (
              <div style={{ display: 'flex', gap: '12px' }}>
                <Button 
                  onClick={() => setIsEditing(true)} 
                  label="Edit List" 
                />
                <Button 
                  onClick={handleDeleteList} 
                  label="Delete List" 
                  type="basic"
                />
              </div>
            )}
          </div>

          {/* List Items */}
          {items.length > 0 ? (
            <div>
              {items.map((item, index) => (
                <div 
                  key={item.id || index}
                  style={{
                    marginBottom: '20px',
                    padding: '20px',
                    backgroundColor: 'var(--colour1)',
                    borderRadius: '12px',
                    border: '1px solid var(--colour3)'
                  }}
                >
                  <div 
                    className="list-item-container"
                    style={{ 
                      display: 'flex', 
                      alignItems: 'flex-start', 
                      gap: '16px'
                    }}
                  >
                    {/* Order Number */}
                    <div 
                      className="list-item-number"
                      style={{
                        minWidth: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--colour4)',
                        color: 'var(--colour1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        flexShrink: 0
                      }}
                    >
                      {index + 1}
                    </div>

                    {/* Item Content */}
                    <div 
                      className="list-item-content"
                      style={{ flex: 1 }}
                    >
                      <ListItem 
                        {...item}
                        userId={item.userId || ''}
                        username={item.username || ''}
                        userAvatar={item.userAvatar || ''}
                        timestamp={item.timestamp ? formatTimestamp(item.timestamp) : ''}
                        canEdit={item.userId && auth.currentUser?.uid === item.userId}
                        canDelete={(item.userId && auth.currentUser?.uid === item.userId) || (auth.currentUser?.uid === list.userId)}
                        onEdit={() => handleEditItem(item.id || '', index)}
                        onRemove={() => handleDeleteItem(item.id || '', index)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              color: 'var(--colour4)',
              opacity: 0.6,
              padding: '40px',
              backgroundColor: 'var(--colour1)',
              borderRadius: '12px',
              border: '1px solid var(--colour3)'
            }}>
              This list is empty
            </div>
          )}

          {/* Comments Section */}
          {list && (list.isPublic || (auth.currentUser && list.userId === auth.currentUser.uid)) && (
            <div style={{ marginTop: '40px' }}>
              <h3 style={{ 
                color: 'var(--colour2)', 
                fontFamily: 'var(--font2)', 
                marginBottom: '20px',
                fontSize: '1.4em'
              }}>
                Comments ({comments.length})
              </h3>

              {/* Comment Input - matches list item width and styling */}
              <div style={{
                marginBottom: '20px',
                padding: '20px',
                backgroundColor: 'var(--colour1)',
                borderRadius: '12px',
                border: '1px solid var(--colour3)'
              }}>
                <ForumBox 
                  placeholder="Add a comment to this list..."
                  onSend={handleSendComment} 
                  disabled={commentLoading}
                  maxWords={500}
                />
              </div>

              {/* Comments List */}
              <div>
                {comments.length > 0 ? (
                  comments.map((comment) => (
                    <div key={comment.id} style={{ marginBottom: '16px' }}>
                      <UserMessage
                        username={comment.username || 'Anonymous'}
                        message={comment.text}
                        timestamp={formatTimestamp(comment.timestamp)}
                        userSticker={comment.avatar || 'default-avatar.png'}
                        onClose={() => {}}
                        hideCloseButton={true}
                        reactions={comment.reactions}
                        reactionCount={comment.reactionCount}
                        currentUserReacted={comment.currentUserReacted}
                        onToggleReaction={() => handleToggleCommentReaction(comment.id)}
                      />
                    </div>
                  ))
                ) : (
                  <div style={{
                    textAlign: 'center',
                    color: 'var(--colour4)',
                    opacity: 0.6,
                    padding: '30px',
                    backgroundColor: 'var(--colour1)',
                    borderRadius: '12px',
                    border: '1px solid var(--colour3)',
                    fontStyle: 'italic'
                  }}>
                    No comments yet. Be the first to share your thoughts!
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ListDetailPage;