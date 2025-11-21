import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, orderBy, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import Header from '../components/basic/Header';
import ListItem from '../components/ListItem';
import CreateList from '../components/CreateList';
import Button from '../components/basic/Button';

interface List {
  id: string;
  title: string;
  userId: string;
  username: string;
  timestamp: any;
  itemCount: number;
  items?: any[];
}

const ListDetailPage: React.FC = () => {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const [list, setList] = useState<List | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (listId) {
      loadList();
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

  const handleDelete = async () => {
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
                  onClick={handleDelete} 
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
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'flex-start', 
                    gap: '16px' 
                  }}>
                    {/* Order Number */}
                    <div style={{
                      minWidth: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--colour4)',
                      color: 'var(--colour1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      fontWeight: 'bold'
                    }}>
                      {index + 1}
                    </div>

                    {/* Item Content */}
                    <div style={{ flex: 1 }}>
                      <ListItem 
                        {...item} 
                        username=""
                        timestamp=""
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
        </div>
      )}
    </div>
  );
};

export default ListDetailPage;