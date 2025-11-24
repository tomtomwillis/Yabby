import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, serverTimestamp, getDoc, updateDoc, getDocs, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import AlbumSearchBox from './basic/AlbumSearchBox';
import Button from './basic/Button';
import MessageTextBox from './basic/MessageTextBox';
import './basic/Button.css';

interface AlbumInfo {
  id: string;
  artist: string;
  title: string;
  cover: string;
}

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
  linkUrl?: string;
}

type ListItem = AlbumListItem | CustomListItem;

interface List {
  id: string;
  title: string;
  userId: string;
  username: string;
  timestamp: any;
  itemCount: number;
  isPublic?: boolean;
  items?: ListItem[];
}

interface CreateListProps {
  onListCreated?: (listId: string) => void;
  editMode?: boolean;
  existingListId?: string;
  existingList?: List;
}

const CreateList: React.FC<CreateListProps> = ({ 
  onListCreated, 
  editMode = false, 
  existingListId, 
  existingList 
}) => {
  const [listTitle, setListTitle] = useState(existingList?.title || '');
  const [items, setItems] = useState<ListItem[]>([]);
  const [currentItemText, setCurrentItemText] = useState('');
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [addMode, setAddMode] = useState<'album' | 'custom'>('album');
  const [isPublic, setIsPublic] = useState(existingList?.isPublic ?? true);
  

  // Custom item form state
  const [customTitle, setCustomTitle] = useState('');
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [customLinkUrl, setCustomLinkUrl] = useState('');
  
  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  // Inline editing state
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingImageUrl, setEditingImageUrl] = useState('');
  const [editingLinkUrl, setEditingLinkUrl] = useState('');

  // Load existing items when in edit mode
  useEffect(() => {
    if (editMode && existingListId) {
      loadExistingItems();
    }
  }, [editMode, existingListId]);

  // Function to load existing items from Firestore
  const loadExistingItems = async () => {
    if (!existingListId) return;
    
    try {
      const itemsQuery = query(
        collection(db, 'lists', existingListId, 'items'),
        orderBy('order', 'asc')
      );
      
      const snapshot = await getDocs(itemsQuery);
      const existingItems: ListItem[] = [];
      
      snapshot.forEach((doc) => {
        existingItems.push({ ...doc.data(), id: doc.id } as unknown as ListItem);
      });
      
      setItems(existingItems);
    } catch (error) {
      console.error('Error loading existing items:', error);
    }
  };

  // Environment variables for Navidrome API
  const NAVIDROME_SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
  const NAVIDROME_API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
  const NAVIDROME_API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
  const NAVIDROME_CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID;

  // Extract album ID from Navidrome URL
  const extractAlbumId = (url: string): string | null => {
    const match = url.match(/album\/(.*?)\/show/);
    return match ? match[1] : null;
  };

  // Fetch album info from Navidrome API
  const fetchAlbumInfoById = async (albumId: string): Promise<AlbumInfo | null> => {
    try {
      const response = await fetch(
        `${NAVIDROME_SERVER_URL}/rest/getAlbum?id=${albumId}&u=${NAVIDROME_API_USERNAME}&p=${NAVIDROME_API_PASSWORD}&v=1.16.1&c=${NAVIDROME_CLIENT_ID}`,
        {
          headers: {
            Authorization: 'Basic ' + btoa(`${NAVIDROME_API_USERNAME}:${NAVIDROME_API_PASSWORD}`),
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'application/xml');

      const albumElement = xmlDoc.querySelector('album');
      if (!albumElement) {
        throw new Error('Album not found in response');
      }

      return {
        id: albumElement.getAttribute('id') || '',
        artist: albumElement.getAttribute('artist') || 'Unknown Artist',
        title: albumElement.getAttribute('name') || 'Unknown Album',
        cover: `${NAVIDROME_SERVER_URL}/rest/getCoverArt?id=${albumElement.getAttribute(
          'coverArt'
        )}&u=${NAVIDROME_API_USERNAME}&p=${NAVIDROME_API_PASSWORD}&v=1.16.1&c=${NAVIDROME_CLIENT_ID}`,
      };
    } catch (error) {
      console.error('Failed to fetch album info:', error);
      return null;
    }
  };

  // Handle album selection from search
  const handleAlbumSelect = async (albumId: string) => {
    const albumInfo = await fetchAlbumInfoById(albumId);
    if (albumInfo) {
      setSelectedAlbum(albumInfo);
    } else {
      alert('Failed to fetch album information');
    }
  };

  // Handle URL submission
  const handleUrlSubmit = async (url: string) => {
    const albumId = extractAlbumId(url);
    if (!albumId) {
      alert('Invalid Navidrome album URL');
      return;
    }
    await handleAlbumSelect(albumId);
  };

  // Add album to list
  const handleAddAlbum = () => {
    if (!selectedAlbum) {
      alert('Please select an album first');
      return;
    }

    const newAlbum: AlbumListItem = {
      type: 'album',
      albumId: selectedAlbum.id,
      albumTitle: selectedAlbum.title,
      albumArtist: selectedAlbum.artist,
      albumCover: selectedAlbum.cover,
      userText: currentItemText,
      order: items.length
    };

    setItems([...items, newAlbum]);
    setSelectedAlbum(null);
    setCurrentItemText('');
  };

  // Add custom item to list
  const handleAddCustomItem = () => {
    if (!customTitle.trim()) {
      alert('Please enter a title for the custom item');
      return;
    }

    const newCustomItem: CustomListItem = {
      type: 'custom',
      title: customTitle.trim(),
      ...(customImageUrl.trim() && { imageUrl: customImageUrl.trim() }),
      ...(customLinkUrl.trim() && { linkUrl: customLinkUrl.trim() }),
      userText: currentItemText,
      order: items.length
    };

    setItems([...items, newCustomItem]);
    setCustomTitle('');
    setCustomImageUrl('');
    setCustomLinkUrl('');
    setCurrentItemText('');
  };

  // Remove item from list
  const handleRemoveItem = (index: number) => {
    const updatedItems = items.filter((_, i) => i !== index);
    // Update order numbers
    const reorderedItems = updatedItems.map((item, i) => ({
      ...item,
      order: i
    }));
    setItems(reorderedItems);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', '');
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newItems = [...items];
    const draggedItem = newItems[draggedIndex];
    
    // Remove the dragged item
    newItems.splice(draggedIndex, 1);
    
    // Insert at new position
    newItems.splice(dropIndex, 0, draggedItem);
    
    // Update order indices
    const reorderedItems = newItems.map((item, index) => ({
      ...item,
      order: index
    }));
    
    setItems(reorderedItems);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Inline editing handlers
  const startEditingItem = (index: number, currentText: string) => {
    setEditingItemIndex(index);
    setEditingText(currentText || '');
    
    // If it's a custom item, also set the image and link URLs for editing
    const item = items[index];
    if (item.type === 'custom') {
      setEditingImageUrl(item.imageUrl || '');
      setEditingLinkUrl(item.linkUrl || '');
    }
  };

  const saveEditedText = () => {
    if (editingItemIndex !== null) {
      const updatedItems = [...items];
      const currentItem = updatedItems[editingItemIndex];
      
      if (currentItem.type === 'custom') {
        // Update text, image URL, and link URL for custom items
        updatedItems[editingItemIndex] = {
          ...currentItem,
          userText: editingText.trim(),
          imageUrl: editingImageUrl.trim() || undefined,
          linkUrl: editingLinkUrl.trim() || undefined
        };
      } else {
        // Update only text for album items
        updatedItems[editingItemIndex] = {
          ...currentItem,
          userText: editingText.trim()
        };
      }
      
      setItems(updatedItems);
    }
    setEditingItemIndex(null);
    setEditingText('');
    setEditingImageUrl('');
  };

  const cancelEditing = () => {
    setEditingItemIndex(null);
    setEditingText('');
    setEditingImageUrl('');
    setEditingLinkUrl('');
  };

  // Add keyboard event listener for editing
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (editingItemIndex !== null) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelEditing();
        }
        // Note: We don't use Enter to save since MessageTextBox needs Enter for line breaks
      }
    };

    if (editingItemIndex !== null) {
      document.addEventListener('keydown', handleKeyPress);
      return () => document.removeEventListener('keydown', handleKeyPress);
    }
  }, [editingItemIndex]);

  // Save list to Firestore with subcollection
  const handleSaveList = async () => {
    if (!auth.currentUser) {
      alert('Please log in to create a list');
      return;
    }

    if (!listTitle.trim()) {
      alert('Please enter a list title');
      return;
    }

    if (items.length === 0) {
      alert('Please add at least one item to the list');
      return;
    }

    setLoading(true);

    try {
      if (editMode && existingListId) {
        // Update existing list
        await updateDoc(doc(db, 'lists', existingListId), {
          title: listTitle.trim(),
          itemCount: items.length,
          isPublic: isPublic
        });

        // Delete all existing items
        const existingItemsQuery = query(collection(db, 'lists', existingListId, 'items'));
        const existingItemsSnapshot = await getDocs(existingItemsQuery);
        
        for (const itemDoc of existingItemsSnapshot.docs) {
          await deleteDoc(itemDoc.ref);
        }

        // Add updated items
        const itemsCollection = collection(db, 'lists', existingListId, 'items');
        
        for (const item of items) {
          const cleanItemData: any = {
            type: item.type,
            userText: item.userText,
            order: item.order,
            timestamp: serverTimestamp()
          };

          if (item.type === 'album') {
            cleanItemData.albumId = item.albumId;
            cleanItemData.albumTitle = item.albumTitle;
            cleanItemData.albumArtist = item.albumArtist;
            cleanItemData.albumCover = item.albumCover;
          } else if (item.type === 'custom') {
            cleanItemData.title = item.title;
            if (item.imageUrl && item.imageUrl.trim()) {
              cleanItemData.imageUrl = item.imageUrl;
            }
            if (item.linkUrl && item.linkUrl.trim()) {
              cleanItemData.linkUrl = item.linkUrl;
            }
          }

          await addDoc(itemsCollection, cleanItemData);
        }

        alert('List updated successfully!');
      } else {
        // Fetch username from user profile (same pattern as MessageBoard)
        let username = 'Anonymous';
        try {
          const userDocRef = doc(db, 'users', auth.currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            username = userDoc.data().username || 'Anonymous';
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }

        // Create main list document
        const listDocRef = await addDoc(collection(db, 'lists'), {
          title: listTitle.trim(),
          userId: auth.currentUser.uid,
          username: username,
          timestamp: serverTimestamp(),
          itemCount: items.length,
          isPublic: isPublic
        });

      // Add items as subcollection
      const itemsCollection = collection(listDocRef, 'items');
      
      for (const item of items) {
        // Clean the item data for Firestore (remove undefined fields)
        const cleanItemData: any = {
          type: item.type,
          userText: item.userText,
          order: item.order,
          timestamp: serverTimestamp()
        };

        if (item.type === 'album') {
          cleanItemData.albumId = item.albumId;
          cleanItemData.albumTitle = item.albumTitle;
          cleanItemData.albumArtist = item.albumArtist;
          cleanItemData.albumCover = item.albumCover;
        } else if (item.type === 'custom') {
          cleanItemData.title = item.title;
          // Only add imageUrl if it exists and is not empty
          if (item.imageUrl && item.imageUrl.trim()) {
            cleanItemData.imageUrl = item.imageUrl;
          }
          // Only add linkUrl if it exists and is not empty
          if (item.linkUrl && item.linkUrl.trim()) {
            cleanItemData.linkUrl = item.linkUrl;
          }
        }

        await addDoc(itemsCollection, cleanItemData);
      }

        alert('List created successfully!');
        
        // Reset form
        setListTitle('');
        setItems([]);
        setSelectedAlbum(null);
        setCurrentItemText('');
        setCustomTitle('');
        setCustomImageUrl('');
        setCustomLinkUrl('');

        // Notify parent component
        if (onListCreated) {
          onListCreated(listDocRef.id);
        }
      }
      
      // Reset form for edit mode
      if (editMode) {
        setSelectedAlbum(null);
        setCurrentItemText('');
        setCustomTitle('');
        setCustomImageUrl('');
        setCustomLinkUrl('');
        
        // Notify parent component (edit complete)
        if (onListCreated) {
          onListCreated(existingListId || '');
        }
      }

    } catch (error) {
      console.error('Error creating list:', error);
      alert('Failed to create list. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>

      {/* List Title Input */}
      <div style={{ marginBottom: '20px' }}>
        <MessageTextBox
          value={listTitle}
          onChange={setListTitle}
          placeholder="Enter list title..."
          showSendButton={false}
          showCounter={false}
        />
      </div>

      {/* Mode Toggle */}
      <div style={{ marginBottom: '20px', textAlign: 'center' }}>
        <div style={{ 
          display: 'inline-flex', 
          backgroundColor: 'var(--colour2)', 
          borderRadius: '8px', 
          padding: '4px',
          gap: '4px'
        }}>
          <button
            onClick={() => setAddMode('album')}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: addMode === 'album' ? 'var(--colour3)' : 'transparent',
              color: 'var(--colour4)',
              cursor: 'pointer',
              fontSize: '14px',
              fontFamily: 'var(--font2)'
            }}
          >
            Add Album
          </button>
          <button
            onClick={() => setAddMode('custom')}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: addMode === 'custom' ? 'var(--colour3)' : 'transparent',
              color: 'var(--colour4)',
              cursor: 'pointer',
              fontSize: '14px',
              fontFamily: 'var(--font2)'
            }}
          >
            Add Custom Item
          </button>
        </div>
      </div>

      {/* Album Search Mode */}
      {addMode === 'album' && (
        <>
          <div style={{ marginBottom: '20px' }}>
            <AlbumSearchBox
              placeholder="Search for an album or paste Navidrome URL..."
              onAlbumSelect={handleAlbumSelect}
              onUrlSubmit={handleUrlSubmit}
            />
          </div>

          {/* Selected Album Preview */}
          {selectedAlbum && (
            <div style={{ 
              marginBottom: '20px', 
              padding: '16px', 
              borderRadius: '8px',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start'
            }}>
              <img 
                src={selectedAlbum.cover} 
                alt={`${selectedAlbum.title} by ${selectedAlbum.artist}`}
                style={{ width: '60px', height: '60px', borderRadius: '4px', objectFit: 'cover' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', color: 'var(--colour5)', marginBottom: '4px' }}>
                  {selectedAlbum.title}
                </div>
                <div style={{ color: 'var(--colour5)', opacity: 0.8, fontSize: '0.9em' }}>
                  by {selectedAlbum.artist}
                </div>
                <div style={{ marginTop: '8px' }}>
                  <MessageTextBox
                    value={currentItemText}
                    onChange={setCurrentItemText}
                    placeholder="Add your thoughts about this album..."
                    showSendButton={false}
                    showCounter={false}
                    rows={4}
                  />
                </div>
                <div style={{ marginTop: '8px' }}>
                  <Button onClick={handleAddAlbum} label="Add to List" />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Custom Item Mode */}
      {addMode === 'custom' && (
        <div style={{ 
          marginBottom: '20px', 
          padding: '16px', 
          borderRadius: '8px'
        }}>
          <h4 style={{ color: 'var(--colour5)', marginTop: 0, marginBottom: '12px' }}>
            Add Custom Item
          </h4>
          
          <div style={{ marginBottom: '12px' }}>
            <MessageTextBox
              value={customTitle}
              onChange={setCustomTitle}
              placeholder="Enter title (required)"
              showSendButton={false}
              showCounter={false}
            />
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <MessageTextBox
              value={customImageUrl}
              onChange={setCustomImageUrl}
              placeholder="Image URL (optional)"
              showSendButton={false}
              showCounter={false}
            />
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <MessageTextBox
              value={customLinkUrl}
              onChange={setCustomLinkUrl}
              placeholder="Link URL (optional)"
              showSendButton={false}
              showCounter={false}
            />
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <MessageTextBox
              value={currentItemText}
              onChange={setCurrentItemText}
              placeholder="Add your thoughts about this item..."
              showSendButton={false}
              showCounter={false}
              rows={4}
            />
          </div>
          
          <Button onClick={handleAddCustomItem} label="Add to List" />
        </div>
      )}

      {/* Items in List */}
      {items.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: 'var(--colour2)', fontFamily: 'var(--font2)', marginBottom: '12px' }}>
            Items in List ({items.length})
          </h3>
          <div style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--colour2)', fontStyle: 'italic' }}>
            💡 Drag items by the handle to reorder them
          </div>
          {items.map((item, index) => {
            const isDragging = draggedIndex === index;
            const isDragOver = dragOverIndex === index;
            
            return (
              <div 
                key={index}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                style={{ 
                  marginBottom: '12px', 
                  padding: '12px', 
                  backgroundColor: isDragging ? 'var(--colour3)' : 'var(--colour1)', 
                  borderRadius: '8px',
                  border: isDragOver ? '2px dashed var(--colour4)' : '1px solid var(--colour3)',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  position: 'relative',
                  opacity: isDragging ? 0.5 : 1,
                  transform: isDragOver ? 'translateY(-2px)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Drag handle */}
                <div 
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnd={handleDragEnd}
                  style={{
                    color: 'var(--colour4)',
                    fontSize: '16px',
                    cursor: 'grab',
                    padding: '5px',
                    userSelect: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    minWidth: '30px'
                  }}
                >
                  <span style={{ lineHeight: 1 }}>⋮⋮</span>
                  <span style={{ fontSize: '12px', marginTop: '2px' }}>{index + 1}</span>
                </div>

                <button
                  onClick={() => handleRemoveItem(index)}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--colour4)',
                    cursor: 'pointer',
                    fontSize: '16px'
                  }}
                  aria-label="Remove item"
                >
                  ✕
                </button>
                
                {/* Image for both album and custom items */}
                {((item.type === 'album' && item.albumCover) || (item.type === 'custom' && item.imageUrl)) && (
                  item.type === 'custom' && item.linkUrl ? (
                    <a href={item.linkUrl} target="_blank" rel="noopener noreferrer">
                      <img 
                        src={item.imageUrl} 
                        alt={item.title}
                        style={{ width: '50px', height: '50px', borderRadius: '4px', objectFit: 'cover', cursor: 'pointer' }}
                      />
                    </a>
                  ) : (
                    <img 
                      src={item.type === 'album' ? item.albumCover : item.imageUrl} 
                      alt={item.type === 'album' ? `${item.albumTitle} by ${item.albumArtist}` : item.title}
                      style={{ width: '50px', height: '50px', borderRadius: '4px', objectFit: 'cover' }}
                    />
                  )
                )}
                
                <div style={{ flex: 1, paddingRight: '24px' }}>
                  <div style={{ fontWeight: 'bold', color: 'var(--colour2)', marginBottom: '2px' }}>
                    {item.type === 'album' ? (
                      item.albumTitle
                    ) : item.linkUrl ? (
                      <a 
                        href={item.linkUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: 'inherit', textDecoration: 'none' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.textDecoration = 'underline';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.textDecoration = 'none';
                        }}
                      >
                        {item.title}
                      </a>
                    ) : (
                      item.title
                    )}
                  </div>
                  {item.type === 'album' && (
                    <div style={{ color: 'var(--colour2)', opacity: 0.8, fontSize: '0.9em', marginBottom: '4px' }}>
                      by {item.albumArtist}
                    </div>
                  )}
                  {editingItemIndex === index ? (
                    <div style={{ marginBottom: '8px', backgroundColor: 'var(--colour1)' }}>
                      {/* Show image and link URL inputs for custom items */}
                      {item.type === 'custom' && (
                        <>
                          <div style={{ marginBottom: '8px' }}>
                            <MessageTextBox
                              value={editingImageUrl}
                              onChange={setEditingImageUrl}
                              placeholder="Image URL (leave empty to remove image)"
                              showSendButton={false}
                              showCounter={false}
                            />
                          </div>
                          <div style={{ marginBottom: '8px' }}>
                            <MessageTextBox
                              value={editingLinkUrl}
                              onChange={setEditingLinkUrl}
                              placeholder="Link URL (leave empty to remove link)"
                              showSendButton={false}
                              showCounter={false}
                            />
                          </div>
                        </>
                      )}
                      <div>
                        <MessageTextBox
                          value={editingText}
                          onChange={setEditingText}
                          placeholder="Enter description..."
                          showSendButton={false}
                          showCounter={false}
                          rows={4}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button
                          onClick={saveEditedText}
                          style={{
                            backgroundColor: 'var(--colour4)',
                            color: 'var(--colour1)',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditing}
                          style={{
                            backgroundColor: 'var(--colour3)',
                            color: 'var(--colour4)',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '12px'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      style={{ 
                        color: 'var(--colour4)', 
                        fontSize: '0.9em',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        border: '1px solid transparent',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--colour2)';
                        e.currentTarget.style.border = '1px solid var(--colour3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.border = '1px solid transparent';
                      }}
                      onClick={() => startEditingItem(index, item.userText)}
                      title="Click to edit description"
                    >
                      {item.userText || 'Click to add description...'}
                      <span style={{ marginLeft: '8px', opacity: 0.6, fontSize: '0.8em' }}>✏️</span>
                    </div>
                  )}
                  <div style={{ color: 'var(--colour4)', opacity: 0.6, fontSize: '0.8em', marginTop: '4px' }}>
                    {item.type === 'album' ? '🎵 Album' : '📝 Custom Item'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
{/* Public/Private Toggle */}
          <div style={{ marginBottom: '20px' }}>
             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--colour2)' }}>
               <input
                 type="checkbox"
                 checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
               Make this list public
              </label>
          </div>
      {/* Save Button */}
      <div style={{ textAlign: 'center' }}>
        <Button 
          onClick={handleSaveList}
          disabled={loading || !listTitle.trim() || items.length === 0}
          label={loading ? (editMode ? 'Updating List...' : 'Creating List...') : (editMode ? 'Update List' : 'Save List')}
        />
      </div>
    </div>
  );
};

export default CreateList;