import React, { useState } from 'react';
import { collection, addDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
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
}

type ListItem = AlbumListItem | CustomListItem;

interface CreateListProps {
  onListCreated?: (listId: string) => void;
}

const CreateList: React.FC<CreateListProps> = ({ onListCreated }) => {
  const [listTitle, setListTitle] = useState('');
  const [items, setItems] = useState<ListItem[]>([]);
  const [currentItemText, setCurrentItemText] = useState('');
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [addMode, setAddMode] = useState<'album' | 'custom'>('album');
  
  // Custom item form state
  const [customTitle, setCustomTitle] = useState('');
  const [customImageUrl, setCustomImageUrl] = useState('');

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
      userText: currentItemText,
      order: items.length
    };

    setItems([...items, newCustomItem]);
    setCustomTitle('');
    setCustomImageUrl('');
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
        itemCount: items.length
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

      // Notify parent component
      if (onListCreated) {
        onListCreated(listDocRef.id);
      }

    } catch (error) {
      console.error('Error creating list:', error);
      alert('Failed to create list. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <h2 style={{ color: 'var(--colour2)', fontFamily: 'var(--font2)', marginBottom: '20px' }}>
        Create New Album List
      </h2>

      {/* List Title Input */}
      <div style={{ marginBottom: '20px' }}>
        <MessageTextBox
          value={listTitle}
          onChange={setListTitle}
          placeholder="Enter list title..."
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
              backgroundColor: '#f8f9fa', 
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
          backgroundColor: '#f8f9fa', 
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
            />
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <MessageTextBox
              value={customImageUrl}
              onChange={setCustomImageUrl}
              placeholder="Image URL (optional)"
            />
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <MessageTextBox
              value={currentItemText}
              onChange={setCurrentItemText}
              placeholder="Add your thoughts about this item..."
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
          {items.map((item, index) => (
            <div 
              key={index}
              style={{ 
                marginBottom: '12px', 
                padding: '12px', 
                backgroundColor: 'var(--colour1)', 
                borderRadius: '8px',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-start',
                position: 'relative'
              }}
            >
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
                <img 
                  src={item.type === 'album' ? item.albumCover : item.imageUrl} 
                  alt={item.type === 'album' ? `${item.albumTitle} by ${item.albumArtist}` : item.title}
                  style={{ width: '50px', height: '50px', borderRadius: '4px', objectFit: 'cover' }}
                />
              )}
              
              <div style={{ flex: 1, paddingRight: '24px' }}>
                <div style={{ fontWeight: 'bold', color: 'var(--colour4)', marginBottom: '2px' }}>
                  {item.type === 'album' ? item.albumTitle : item.title}
                </div>
                {item.type === 'album' && (
                  <div style={{ color: 'var(--colour4)', opacity: 0.8, fontSize: '0.9em', marginBottom: '4px' }}>
                    by {item.albumArtist}
                  </div>
                )}
                <div style={{ color: 'var(--colour4)', fontSize: '0.9em' }}>
                  {item.userText || 'No description'}
                </div>
                <div style={{ color: 'var(--colour4)', opacity: 0.6, fontSize: '0.8em', marginTop: '4px' }}>
                  {item.type === 'album' ? '🎵 Album' : '📝 Custom Item'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save Button */}
      <div style={{ textAlign: 'center' }}>
        <Button 
          onClick={handleSaveList}
          disabled={loading || !listTitle.trim() || items.length === 0}
          label={loading ? 'Creating List...' : 'Save List'}
        />
      </div>
    </div>
  );
};

export default CreateList;