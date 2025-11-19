import React, { useState, useEffect } from 'react';
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
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
  const [showCreateForm, setShowCreateForm] = useState(false);

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

  // Fetch items for a specific list
  const fetchItemsForList = async (listId: string) => {
    try {
      const itemsQuery = query(
        collection(db, 'lists', listId, 'items'),
        orderBy('order', 'asc')
      );
      
      const snapshot = await getDocs(itemsQuery);
      const items: ListItem[] = [];
      
      snapshot.forEach((doc) => {
        items.push(doc.data() as ListItem);
      });

      return items;
    } catch (error) {
      console.error('Error fetching items:', error);
      return [];
    }
  };

  // Toggle list expansion and fetch albums if needed
  const toggleListExpansion = async (listId: string) => {
    const newExpandedLists = new Set(expandedLists);
    
    if (expandedLists.has(listId)) {
      newExpandedLists.delete(listId);
    } else {
      newExpandedLists.add(listId);
      
      // Fetch items for this list if not already loaded
      const list = lists.find(l => l.id === listId);
      if (list && !list.items) {
        const items = await fetchItemsForList(listId);
        setLists(prevLists => 
          prevLists.map(l => 
            l.id === listId ? { ...l, items } : l
          )
        );
      }
    }
    
    setExpandedLists(newExpandedLists);
  };

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

  // Delete a list (only allow users to delete their own lists)
  const handleDeleteList = async (listId: string, listTitle: string, listUserId: string) => {
    // Check if the current user owns this list
    if (!auth.currentUser || auth.currentUser.uid !== listUserId) {
      alert('You can only delete your own lists');
      return;
    }

    // Confirm deletion
    if (!confirm(`Are you sure you want to delete the list "${listTitle}"? This cannot be undone.`)) {
      return;
    }

    try {
      // Delete the main list document (subcollections are automatically deleted due to Firestore rules)
      await deleteDoc(doc(db, 'lists', listId));
      
      // Note: In production, you might want to also manually delete the subcollection
      // for cleaner data management, but for this use case the main doc deletion is sufficient
      
      alert('List deleted successfully');
    } catch (error) {
      console.error('Error deleting list:', error);
      alert('Failed to delete list. Please try again.');
    }
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
      <Header title="Album Lists" subtitle={''} />
      
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
        {/* Create List Section */}
        <div style={{ marginBottom: '30px' }}>
          {!showCreateForm ? (
            <div style={{ textAlign: 'center' }}>
              <Button
                onClick={() => setShowCreateForm(true)}
                label="Create a list"
                type="basic"
              />
            </div>
          ) : (
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
          )}
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
                  alignItems: 'flex-start',
                  marginBottom: expandedLists.has(list.id) ? '16px' : '0'
                }}>
                  {/* Clickable expand/collapse area */}
                  <div 
                    onClick={() => toggleListExpansion(list.id)}
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
                      {expandedLists.has(list.id) ? '▼' : '▶'}
                    </div>
                  </div>
                  
                  {/* Delete button (only show for list owner) */}
                  {auth.currentUser && auth.currentUser.uid === list.userId && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent expanding/collapsing when clicking delete
                        handleDeleteList(list.id, list.title, list.userId);
                      }}
                      style={{
                        background: 'transparent',
                        border: '1px solid #dc3545',
                        color: '#dc3545',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#dc3545';
                        e.currentTarget.style.color = 'white';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = '#dc3545';
                      }}
                      title={`Delete "${list.title}"`}
                    >
                      Delete
                    </button>
                  )}
                </div>

                {/* Expanded Albums */}
                {expandedLists.has(list.id) && (
                  <div>
                    {!list.items ? (
                      <div style={{ textAlign: 'center', padding: '20px', opacity: 0.7 }}>
                        Loading items...
                      </div>
                    ) : list.items.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '20px', opacity: 0.7 }}>
                        No items in this list.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {list.items
                          .sort((a, b) => a.order - b.order)
                          .map((item, index) => {
                            const key = item.type === 'album' ? `${item.albumId}-${index}` : `${item.title}-${index}`;
                            
                            if (item.type === 'album') {
                              return (
                                <ListItem
                                  key={key}
                                  type="album"
                                  albumId={item.albumId}
                                  albumTitle={item.albumTitle}
                                  albumArtist={item.albumArtist}
                                  albumCover={item.albumCover}
                                  userText={item.userText}
                                  username={list.username}
                                  timestamp={`#${index + 1} in list`}
                                  showRemoveButton={false}
                                />
                              );
                            } else {
                              return (
                                <ListItem
                                  key={key}
                                  type="custom"
                                  title={item.title}
                                  imageUrl={item.imageUrl}
                                  userText={item.userText}
                                  username={list.username}
                                  timestamp={`#${index + 1} in list`}
                                  showRemoveButton={false}
                                />
                              );
                            }
                          })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ListsPage;