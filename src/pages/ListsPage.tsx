import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, onSnapshot, orderBy, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import Header from '../components/basic/Header';
import Button from '../components/basic/Button';
import CreateList from '../components/CreateList';
import ListItem from '../components/ListItem';

interface BaseListItem {
  type: 'album' | 'custom';
  userText: string;
  order: number;
}

interface AlbumListItem extends BaseListItem {
  type: 'album';
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  albumCover: string;
}

interface CustomListItem extends BaseListItem {
  type: 'custom';
  title: string;
  imageUrl?: string;
}

type ListItem = AlbumListItem | CustomListItem;

interface List {
  id: string;
  title: string;
  userId: string;
  username: string;
  timestamp: any;
  itemCount: number;
  items?: ListItem[];
}

const ListsPage: React.FC = () => {
  const navigate = useNavigate();
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);

  // Fetch lists from Firestore
  useEffect(() => {
    const listsQuery = query(
      collection(db, 'lists'),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(listsQuery, (snapshot) => {
      const listsData: List[] = [];
      snapshot.forEach((doc) => {
        listsData.push({
          id: doc.id,
          ...doc.data()
        } as List);
      });
      setLists(listsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);





  // Format timestamp for display
  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Unknown time';
    
    try {
      const date = timestamp.toDate();
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Unknown time';
    }
  };

  // Handle list creation completion
  const handleListCreated = (listId: string) => {
    setShowCreateForm(false);
    // The list will automatically appear via the real-time listener
  };



  // Handle edit completion
  const handleEditComplete = () => {
    setEditingListId(null);
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--colour4)' }}>
        Loading lists...
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header title="Lists" subtitle={''} />
      
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
        {/* Create List Section */}
        <div style={{ marginBottom: '30px' }}>
          {!showCreateForm && !editingListId ? (
            <div style={{ textAlign: 'center' }}>
              <Button
                onClick={() => setShowCreateForm(true)}
                label="Create a list"
                type="basic"
              />
            </div>
          ) : showCreateForm ? (
            <div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '20px' 
              }}>
                <h2 style={{ color: 'var(--colour2)', margin: 0 }}>Create New List</h2>
                <Button
                  onClick={() => setShowCreateForm(false)}
                  label="Cancel"
                  type="basic"
                />
              </div>
              <CreateList onListCreated={handleListCreated} />
            </div>
          ) : editingListId ? (
            <div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '20px' 
              }}>
                <h2 style={{ color: 'var(--colour2)', margin: 0 }}>
                  Edit List: {lists.find(l => l.id === editingListId)?.title}
                </h2>
                <Button
                  onClick={() => setEditingListId(null)}
                  label="Cancel"
                  type="basic"
                />
              </div>
              <CreateList 
                onListCreated={handleEditComplete}
                editMode={true}
                existingListId={editingListId}
                existingList={lists.find(l => l.id === editingListId)}
              />
            </div>
          ) : null}
        </div>

        {/* Lists Display */}
        <div>
          <h2 style={{ 
            color: 'var(--colour2)', 
            fontFamily: 'var(--font2)', 
            marginBottom: '20px',
            textAlign: 'center'
          }}>
            All Lists ({lists.length})
          </h2>

          {lists.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              color: 'var(--colour4)', 
              opacity: 0.7,
              fontSize: '18px',
              padding: '40px 0'
            }}>
              No lists created yet. Create your first album list above!
            </div>
          ) : (
            lists.map((list) => (
              <div 
                key={list.id}
                style={{
                  backgroundColor: 'var(--colour2)',
                  borderRadius: '12px',
                  padding: '20px',
                  marginBottom: '20px',
                  color: 'var(--colour4)'
                }}
              >
                {/* List Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start'
                }}>
                  {/* Clickable list area */}
                  <div 
                    onClick={() => navigate(`/lists/${list.id}`)}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flex: 1,
                      paddingRight: '12px'
                    }}
                  >
                    <div>
                      <h3 style={{ 
                        margin: '0 0 8px 0', 
                        fontSize: '1.3em',
                        fontWeight: 'bold'
                      }}>
                        {list.title}
                      </h3>
                      <div style={{ 
                        fontSize: '0.9em', 
                        opacity: 0.8,
                        marginBottom: '4px'
                      }}>
                        by {list.username} • {formatTimestamp(list.timestamp)}
                      </div>
                      <div style={{ 
                        fontSize: '0.9em', 
                        opacity: 0.8 
                      }}>
                        {list.itemCount} item{list.itemCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: '1.2em' }}>
                      →
                    </div>
                  </div>
                </div>


              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ListsPage;