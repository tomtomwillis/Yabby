import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, serverTimestamp, getDoc, updateDoc, getDocs, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import AlbumSearchBox from './basic/AlbumSearchBox';
import './CreateList.css';

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
  addedByUserId?: string;
  addedByUsername?: string;
  addedByAvatar?: string;
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
  isCollaborative?: boolean;
  items?: ListItem[];
}

interface CreateListProps {
  onListCreated?: (listId: string) => void;
  onCancel?: () => void;
  editMode?: boolean;
  existingListId?: string;
  existingList?: List;
  isCollaborativeEdit?: boolean;
}

const CreateList: React.FC<CreateListProps> = ({
  onListCreated,
  onCancel,
  editMode = false,
  existingListId,
  existingList,
  isCollaborativeEdit = false
}) => {
  const [listTitle, setListTitle] = useState(existingList?.title || '');
  const [items, setItems] = useState<ListItem[]>([]);
  const [currentItemText, setCurrentItemText] = useState('');
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumInfo | null>(null);
  const [loading, setLoading] = useState(false);
  // Said on the slip itself rather than in a dialog — nothing on these pages
  // interrupts you to tell you something.
  const [error, setError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<'album' | 'custom'>('album');
  const [isPublic, setIsPublic] = useState(existingList?.isPublic ?? true);
  const [isCollaborative, setIsCollaborative] = useState(existingList?.isCollaborative ?? false);
  const [currentUserData, setCurrentUserData] = useState<{ username: string; avatar: string } | null>(null);

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

  // Fetch current user's profile data for item attribution
  useEffect(() => {
    const fetchUserData = async () => {
      if (!auth.currentUser) return;
      try {
        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const data = userDoc.data();
          setCurrentUserData({
            username: data.username || 'Anonymous',
            avatar: data.avatar || ''
          });
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };
    fetchUserData();
  }, []);

  // Collaborative lists must be public
  useEffect(() => {
    if (isCollaborative) {
      setIsPublic(true);
    }
  }, [isCollaborative]);

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
      setError(null);
      setSelectedAlbum(albumInfo);
    } else {
      setError('could not fetch that album.');
    }
  };

  // Handle URL submission
  const handleUrlSubmit = async (url: string) => {
    const albumId = extractAlbumId(url);
    if (!albumId) {
      setError('that is not a navidrome album url.');
      return;
    }
    await handleAlbumSelect(albumId);
  };

  // Add album to list
  const handleAddAlbum = () => {
    if (!selectedAlbum) {
      setError('pick an album first.');
      return;
    }
    setError(null);

    const newAlbum: AlbumListItem = {
      type: 'album',
      albumId: selectedAlbum.id,
      albumTitle: selectedAlbum.title,
      albumArtist: selectedAlbum.artist,
      albumCover: selectedAlbum.cover,
      userText: currentItemText,
      order: items.length,
      addedByUserId: auth.currentUser?.uid || '',
      addedByUsername: currentUserData?.username || 'Anonymous',
      addedByAvatar: currentUserData?.avatar || ''
    };

    setItems([...items, newAlbum]);
    setSelectedAlbum(null);
    setCurrentItemText('');
  };

  // Add custom item to list
  const handleAddCustomItem = () => {
    if (!customTitle.trim()) {
      setError('a custom item needs a title.');
      return;
    }
    setError(null);

    const newCustomItem: CustomListItem = {
      type: 'custom',
      title: customTitle.trim(),
      ...(customImageUrl.trim() && { imageUrl: customImageUrl.trim() }),
      ...(customLinkUrl.trim() && { linkUrl: customLinkUrl.trim() }),
      userText: currentItemText,
      order: items.length,
      addedByUserId: auth.currentUser?.uid || '',
      addedByUsername: currentUserData?.username || 'Anonymous',
      addedByAvatar: currentUserData?.avatar || ''
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
        // Enter is left to the note's textarea for line breaks
      }
    };

    if (editingItemIndex !== null) {
      document.addEventListener('keydown', handleKeyPress);
      return () => document.removeEventListener('keydown', handleKeyPress);
    }
  }, [editingItemIndex]);

  // Compute metadata about the most recent item with an image for home page preview
  const computeLastItemMetadata = (listItems: ListItem[]) => {
    // Search from end of list for an item with an image
    for (let i = listItems.length - 1; i >= 0; i--) {
      const item = listItems[i];
      if (item.type === 'album' && item.albumCover) {
        return {
          lastItemImage: item.albumCover,
          lastItemLink: NAVIDROME_SERVER_URL
            ? `${NAVIDROME_SERVER_URL}/app/#/album/${item.albumId}/show`
            : '',
          lastItemAddedByAvatar: item.addedByAvatar || '',
        };
      } else if (item.type === 'custom' && item.imageUrl) {
        return {
          lastItemImage: item.imageUrl,
          lastItemLink: item.linkUrl || '',
          lastItemAddedByAvatar: item.addedByAvatar || '',
        };
      }
    }
    // No item with an image found - use last item's avatar as fallback
    const lastItem = listItems[listItems.length - 1];
    return {
      lastItemImage: '',
      lastItemLink: '',
      lastItemAddedByAvatar: lastItem?.addedByAvatar || '',
    };
  };

  // Save list to Firestore with subcollection
  const handleSaveList = async () => {
    if (!auth.currentUser) {
      setError('log in to make a list.');
      return;
    }

    if (!listTitle.trim()) {
      setError('give the list a title.');
      return;
    }

    if (items.length === 0) {
      setError('add at least one entry.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      if (editMode && existingListId) {
        // Update existing list
        const lastItemMeta = computeLastItemMetadata(items);

        if (isCollaborativeEdit) {
          // Non-owner: only update fields allowed by Firestore rules
          await updateDoc(doc(db, 'lists', existingListId), {
            title: listTitle.trim(),
            itemCount: items.length,
            lastUpdated: serverTimestamp(),
            lastItemImage: lastItemMeta.lastItemImage,
            lastItemLink: lastItemMeta.lastItemLink,
            lastItemAddedByAvatar: lastItemMeta.lastItemAddedByAvatar,
          });
        } else {
          // Owner: update everything
          await updateDoc(doc(db, 'lists', existingListId), {
            title: listTitle.trim(),
            itemCount: items.length,
            isPublic: isPublic,
            isCollaborative: isCollaborative,
            lastUpdated: serverTimestamp(),
            lastItemImage: lastItemMeta.lastItemImage,
            lastItemLink: lastItemMeta.lastItemLink,
            lastItemAddedByAvatar: lastItemMeta.lastItemAddedByAvatar,
          });
        }

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
            timestamp: serverTimestamp(),
            ...(item.addedByUserId && { addedByUserId: item.addedByUserId }),
            ...(item.addedByUsername && { addedByUsername: item.addedByUsername }),
            ...(item.addedByAvatar && { addedByAvatar: item.addedByAvatar })
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
      } else {
        // Fetch username from user profile (same pattern as MessageBoard)
        let username = 'Anonymous';
        let hasUsername = false;
        try {
          const userDocRef = doc(db, 'users', auth.currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            username = userDoc.data().username || 'Anonymous';
            hasUsername = typeof userDoc.data().username === 'string' && userDoc.data().username.trim().length > 0;
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }

        // The list carries its owner's name and the rules match it against the
        // profile, so a profile with no name cannot create one.
        if (!hasUsername) {
          setError('set a username on your profile before making a list.');
          return;
        }

        const lastItemMeta = computeLastItemMetadata(items);

        // Create main list document
        const listDocRef = await addDoc(collection(db, 'lists'), {
          title: listTitle.trim(),
          userId: auth.currentUser.uid,
          username: username,
          timestamp: serverTimestamp(),
          itemCount: items.length,
          isPublic: isPublic,
          isCollaborative: isCollaborative,
          lastUpdated: serverTimestamp(),
          lastItemImage: lastItemMeta.lastItemImage,
          lastItemLink: lastItemMeta.lastItemLink,
          lastItemAddedByAvatar: lastItemMeta.lastItemAddedByAvatar,
        });

      // Add items as subcollection
      const itemsCollection = collection(listDocRef, 'items');
      
      for (const item of items) {
        // Clean the item data for Firestore (remove undefined fields)
        const cleanItemData: any = {
          type: item.type,
          userText: item.userText,
          order: item.order,
          timestamp: serverTimestamp(),
          ...(item.addedByUserId && { addedByUserId: item.addedByUserId }),
          ...(item.addedByUsername && { addedByUsername: item.addedByUsername }),
          ...(item.addedByAvatar && { addedByAvatar: item.addedByAvatar })
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
      setError(editMode ? 'could not update the list. try again.' : 'could not save the list. try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ls-form">
      {/* No cancel on this line: the page's own bar already carries one, and the
          slip repeats it beside the save. */}
      <h2 className="ls-form-h">
        <span className="ls-form-h-label">{editMode ? 'edit list' : 'new list'}</span>
        <span className="ls-form-h-rule" aria-hidden="true" />
      </h2>

      <div className="ls-form-field">
        <label className="ls-form-label" htmlFor="ls-form-title">title</label>
        <input
          id="ls-form-title"
          className="ls-form-input"
          type="text"
          value={listTitle}
          maxLength={120}
          placeholder="what is this a list of?"
          onChange={(e) => setListTitle(e.target.value)}
        />
      </div>

      {/* Public/Private and Collaborative toggles - hidden for non-owner collaborative edits */}
      {!isCollaborativeEdit && (
        <>
          <div className="ls-form-flags">
            <label className="ls-form-check">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={isCollaborative}
              />
              public
            </label>
            <label className="ls-form-check">
              <input
                type="checkbox"
                checked={isCollaborative}
                onChange={(e) => setIsCollaborative(e.target.checked)}
              />
              collaborative — anyone can add or edit entries
            </label>
          </div>
          {isCollaborative && (
            <p className="ls-form-note">collaborative lists are always public.</p>
          )}
        </>
      )}

      <h3 className="ls-form-h">
        <span className="ls-form-h-label">add</span>
        <span className="ls-form-h-rule" aria-hidden="true" />
      </h3>

      <div className="ls-form-modes">
        <span className="ls-form-modes-key">kind:</span>
        <button
          type="button"
          className={`ls-form-mode${addMode === 'album' ? ' is-sel' : ''}`}
          aria-pressed={addMode === 'album'}
          onClick={() => setAddMode('album')}
        >
          album
        </button>
        <span className="ls-form-mode-sep" aria-hidden="true">/</span>
        <button
          type="button"
          className={`ls-form-mode${addMode === 'custom' ? ' is-sel' : ''}`}
          aria-pressed={addMode === 'custom'}
          onClick={() => setAddMode('custom')}
        >
          anything else
        </button>
      </div>

      {addMode === 'album' && (
        <>
          <AlbumSearchBox
            placeholder="search an album, or paste a navidrome url…"
            onAlbumSelect={handleAlbumSelect}
            onUrlSubmit={handleUrlSubmit}
          />

          {selectedAlbum && (
            <div className="ls-form-pick">
              <img
                className="ls-form-pick-thumb"
                src={selectedAlbum.cover}
                alt={`${selectedAlbum.title} by ${selectedAlbum.artist}`}
              />
              <div>
                <div className="ls-form-pick-name">{selectedAlbum.title}</div>
                <div className="ls-form-pick-artist">by {selectedAlbum.artist}</div>
                <textarea
                  className="ls-form-textarea"
                  value={currentItemText}
                  maxLength={1000}
                  placeholder="what do you make of it?"
                  onChange={(e) => setCurrentItemText(e.target.value)}
                />
                <div className="ls-form-actions">
                  <button type="button" className="ls-form-btn" onClick={handleAddAlbum}>
                    add entry
                  </button>
                  <button
                    type="button"
                    className="ls-form-quiet"
                    onClick={() => setSelectedAlbum(null)}
                  >
                    discard
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {addMode === 'custom' && (
        <div>
          <div className="ls-form-field">
            <label className="ls-form-label" htmlFor="ls-form-custom-title">title</label>
            <input
              id="ls-form-custom-title"
              className="ls-form-input"
              type="text"
              value={customTitle}
              maxLength={200}
              placeholder="required"
              onChange={(e) => setCustomTitle(e.target.value)}
            />
          </div>

          <div className="ls-form-field">
            <label className="ls-form-label" htmlFor="ls-form-custom-image">image url</label>
            <input
              id="ls-form-custom-image"
              className="ls-form-input"
              type="url"
              value={customImageUrl}
              placeholder="optional"
              onChange={(e) => setCustomImageUrl(e.target.value)}
            />
          </div>

          <div className="ls-form-field">
            <label className="ls-form-label" htmlFor="ls-form-custom-link">link url</label>
            <input
              id="ls-form-custom-link"
              className="ls-form-input"
              type="url"
              value={customLinkUrl}
              placeholder="optional"
              onChange={(e) => setCustomLinkUrl(e.target.value)}
            />
          </div>

          <div className="ls-form-field">
            <label className="ls-form-label" htmlFor="ls-form-custom-note">note</label>
            <textarea
              id="ls-form-custom-note"
              className="ls-form-textarea"
              value={currentItemText}
              maxLength={1000}
              placeholder="what do you make of it?"
              onChange={(e) => setCurrentItemText(e.target.value)}
            />
          </div>

          <div className="ls-form-actions">
            <button type="button" className="ls-form-btn" onClick={handleAddCustomItem}>
              add entry
            </button>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <>
          <h3 className="ls-form-h">
            <span className="ls-form-h-label">entries</span>
            <span className="ls-form-h-rule" aria-hidden="true" />
            <span className="ls-form-h-note">{items.length} · drag to reorder</span>
          </h3>

          <ol className="ls-form-entries">
            {items.map((item, index) => {
              const isDragging = draggedIndex === index;
              const isDragOver = dragOverIndex === index;
              const image = item.type === 'album' ? item.albumCover : item.imageUrl;
              const title = item.type === 'album' ? item.albumTitle : item.title;

              return (
                <li
                  key={index}
                  className={`ls-form-entry${isDragging ? ' is-dragging' : ''}${isDragOver ? ' is-dragover' : ''}`}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                >
                  <span
                    className="ls-form-grip"
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    aria-hidden="true"
                  >
                    ⋮⋮
                  </span>

                  <span className="ls-form-entry-n">{String(index + 1).padStart(2, '0')}</span>

                  <div className="ls-form-entry-body">
                    <div className="ls-form-entry-media">
                      {image && (
                        <img
                          className="ls-form-entry-thumb"
                          src={image}
                          alt={title}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}

                      <div className="ls-form-entry-main">
                        <div className="ls-form-entry-head">
                          {item.type === 'custom' && item.linkUrl ? (
                            <a
                              className="ls-form-entry-title"
                              href={item.linkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {title}
                            </a>
                          ) : (
                            <span className="ls-form-entry-title">{title}</span>
                          )}
                          {item.type === 'album' && (
                            <span className="ls-form-entry-artist">by {item.albumArtist}</span>
                          )}
                          <span className="ls-form-entry-kind">
                            {item.type === 'album' ? '[album]' : '[custom]'}
                          </span>
                        </div>

                        {editingItemIndex === index ? (
                          <div className="ls-form-entry-edit">
                            {item.type === 'custom' && (
                              <>
                                <input
                                  className="ls-form-input"
                                  type="url"
                                  value={editingImageUrl}
                                  placeholder="image url — empty to remove"
                                  onChange={(e) => setEditingImageUrl(e.target.value)}
                                />
                                <input
                                  className="ls-form-input"
                                  type="url"
                                  value={editingLinkUrl}
                                  placeholder="link url — empty to remove"
                                  onChange={(e) => setEditingLinkUrl(e.target.value)}
                                />
                              </>
                            )}
                            <textarea
                              className="ls-form-textarea"
                              value={editingText}
                              maxLength={1000}
                              placeholder="what do you make of it?"
                              onChange={(e) => setEditingText(e.target.value)}
                            />
                            <div className="ls-form-actions">
                              <button type="button" className="ls-form-btn" onClick={saveEditedText}>
                                save entry
                              </button>
                              <button type="button" className="ls-form-quiet" onClick={cancelEditing}>
                                cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={`ls-form-entry-text${item.userText ? '' : ' ls-form-entry-text--none'}`}
                            onClick={() => startEditingItem(index, item.userText)}
                            title="Click to edit the note"
                          >
                            {item.userText || 'add a note…'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="ls-form-entry-acts">
                    <button
                      type="button"
                      className="ls-form-del"
                      onClick={() => handleRemoveItem(index)}
                      aria-label={`Remove ${title}`}
                    >
                      del
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}

      <div className="ls-form-actions">
        <button
          type="button"
          className="ls-form-btn ls-form-btn--primary"
          onClick={handleSaveList}
          disabled={loading || !listTitle.trim() || items.length === 0}
        >
          {loading
            ? (editMode ? 'updating…' : 'saving…')
            : (editMode ? 'update list' : 'save list')}
        </button>
        {onCancel && (
          <button type="button" className="ls-form-quiet" onClick={onCancel} disabled={loading}>
            cancel
          </button>
        )}
      </div>

      {error && <p className="ls-form-error" role="alert">{error}</p>}
    </div>
  );
};

export default CreateList;
