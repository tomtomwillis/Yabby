// PlaceSticker.tsx
import React, { useState, useEffect, useRef } from 'react';
import './PlaceSticker.css';
import { db, auth } from '../firebaseConfig';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import MessageTextBox from './basic/MessageTextBox';
import Button from './basic/Button'; // Import the Button component

interface AlbumInfo {
  id: string;
  artist: string;
  title: string;
  cover: string;
}

// Standard album display dimensions for consistent positioning
const ALBUM_DISPLAY_SIZE = 300;
const STICKER_SIZE = 100;

const PlaceSticker: React.FC = () => {
  const [albumURL, setAlbumURL] = useState('');
  const [albumInfo, setAlbumInfo] = useState<AlbumInfo | null>(null);
  const [stickerText, setStickerText] = useState('');
  const [stickerPos, setStickerPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [sticker, setSticker] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPopup, setShowPopup] = useState(false); // State to control the pop-up visibility
  const albumRef = useRef<HTMLDivElement>(null);

  const NAVIDROME_SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
  const NAVIDROME_API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
  const NAVIDROME_API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
  const NAVIDROME_CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID;

  const extractAlbumId = (url: string): string | null => {
    const match = url.match(/album\/(.*?)\/show/);
    return match ? match[1] : null;
  };

  const fetchAlbumInfo = async () => {
    const albumId = extractAlbumId(albumURL);
    if (!albumId) return alert('Invalid Navidrome album URL');

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

      setAlbumInfo({
        id: albumElement.getAttribute('id') || '',
        artist: albumElement.getAttribute('artist') || 'Unknown Artist',
        title: albumElement.getAttribute('name') || 'Unknown Album',
        cover: `${NAVIDROME_SERVER_URL}/rest/getCoverArt?id=${albumElement.getAttribute(
          'coverArt'
        )}&u=${NAVIDROME_API_USERNAME}&p=${NAVIDROME_API_PASSWORD}&v=1.16.1&c=${NAVIDROME_CLIENT_ID}`,
      });

      setShowPopup(true); // Show the pop-up after fetching album info
    } catch (error) {
      alert('Failed to fetch album info');
      console.error(error);
    }
  };

  const fetchSticker = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userDoc = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDoc);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setSticker(data.avatar || null);
      } else {
        setSticker(null);
      }
    } catch (error) {
      console.error('Error fetching user sticker:', error);
    }
  };

  useEffect(() => {
    fetchSticker();
  }, []);

  // Convert screen coordinates to normalized album coordinates (0-300 range)
  const screenToAlbumCoords = (screenX: number, screenY: number, albumRect: DOMRect) => {
    const relativeX = screenX - albumRect.left;
    const relativeY = screenY - albumRect.top;
    
    // Convert to normalized coordinates based on standard album size
    const normalizedX = (relativeX / albumRect.width) * ALBUM_DISPLAY_SIZE;
    const normalizedY = (relativeY / albumRect.height) * ALBUM_DISPLAY_SIZE;
    
    // Clamp to ensure sticker stays within bounds (accounting for sticker size)
    const halfSticker = STICKER_SIZE / 2;
    const clampedX = Math.max(halfSticker, Math.min(ALBUM_DISPLAY_SIZE - halfSticker, normalizedX));
    const clampedY = Math.max(halfSticker, Math.min(ALBUM_DISPLAY_SIZE - halfSticker, normalizedY));
    
    return { x: clampedX, y: clampedY };
  };

  // Convert normalized album coordinates to screen position percentages
  const albumToScreenCoords = (albumX: number, albumY: number) => {
    const xPercent = (albumX / ALBUM_DISPLAY_SIZE) * 100;
    const yPercent = (albumY / ALBUM_DISPLAY_SIZE) * 100;
    return { x: xPercent, y: yPercent };
  };

  // Handle clicking on the album cover to place sticker
  const handleAlbumClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const normalizedPos = screenToAlbumCoords(e.clientX, e.clientY, rect);
    setStickerPos(normalizedPos);
  };

  // Handle mouse down on sticker to start dragging
  const handleStickerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!albumRef.current || !stickerPos) return;

    const albumRect = albumRef.current.getBoundingClientRect();
    const stickerScreenPos = albumToScreenCoords(stickerPos.x, stickerPos.y);
    
    // Calculate screen position of sticker center
    const stickerCenterX = albumRect.left + (stickerScreenPos.x / 100) * albumRect.width;
    const stickerCenterY = albumRect.top + (stickerScreenPos.y / 100) * albumRect.height;
    
    // Calculate offset from mouse to sticker center
    const offsetX = e.clientX - stickerCenterX;
    const offsetY = e.clientY - stickerCenterY;
    
    setDragOffset({ x: offsetX, y: offsetY });
    setIsDragging(true);
  };

  // Handle mouse move for dragging
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !albumRef.current) return;

    const rect = albumRef.current.getBoundingClientRect();
    const adjustedX = e.clientX - dragOffset.x;
    const adjustedY = e.clientY - dragOffset.y;
    
    const normalizedPos = screenToAlbumCoords(adjustedX, adjustedY, rect);
    setStickerPos(normalizedPos);
  };

  // Handle mouse up to stop dragging
  const handleMouseUp = () => {
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
  };

  // Add global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        e.preventDefault();
        if (!albumRef.current) return;

        const rect = albumRef.current.getBoundingClientRect();
        const adjustedX = e.clientX - dragOffset.x;
        const adjustedY = e.clientY - dragOffset.y;
        
        const normalizedPos = screenToAlbumCoords(adjustedX, adjustedY, rect);
        setStickerPos(normalizedPos);
      };

      const handleGlobalMouseUp = (e: MouseEvent) => {
        e.preventDefault();
        setIsDragging(false);
        setDragOffset({ x: 0, y: 0 });
      };

      document.addEventListener('mousemove', handleGlobalMouseMove, { capture: true });
      document.addEventListener('mouseup', handleGlobalMouseUp, { capture: true });

      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove, { capture: true });
        document.removeEventListener('mouseup', handleGlobalMouseUp, { capture: true });
      };
    }
  }, [isDragging, dragOffset]);

  const handleSubmit = async () => {
    if (!auth.currentUser || !albumInfo || !stickerPos || !stickerText.trim() || !sticker) {
      return alert('Please complete all fields before submitting.');
    }

    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);

    try {
      await addDoc(collection(db, 'stickers'), {
        userId: auth.currentUser.uid,
        albumId: albumInfo.id,
        text: stickerText.trim(),
        position: {
          x: stickerPos.x,
          y: stickerPos.y,
        },
        sticker,
        timestamp: serverTimestamp(),
      });

      alert('Sticker placed successfully!');
      window.location.reload();
    } catch (error) {
      console.error('Error submitting sticker:', error);
      alert('Failed to submit sticker. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate display position for the sticker
  const getStickerDisplayStyle = () => {
    if (!stickerPos) return {};
    
    const screenPos = albumToScreenCoords(stickerPos.x, stickerPos.y);
    return {
      left: `${screenPos.x}%`,
      top: `${screenPos.y}%`,
      width: `${(STICKER_SIZE / ALBUM_DISPLAY_SIZE) * 100}%`,
      height: `${(STICKER_SIZE / ALBUM_DISPLAY_SIZE) * 100}%`,
      transform: 'translate(-50%, -50%)'
    };
  };


  const closePopup = () => {
    setShowPopup(false);
    setAlbumInfo(null);
    setStickerPos(null);
    setStickerText('');
  };

  return (
    <div className="place-sticker-container">
      <h2>Place a Sticker</h2>
      <MessageTextBox
        placeholder="Paste Navidrome album URL..."
        value={albumURL}
        onChange={(text) => setAlbumURL(text)}
        onSend={fetchAlbumInfo} 
        disabled={isSubmitting}
        showSendButton={true} 
        showCounter={false} 
      />

      {showPopup && albumInfo && (
        <div className="popup-overlay" onClick={closePopup}>
          <div className="popup-content" onClick={(e) => e.stopPropagation()}>
            <Button
              type="close"
              onClick={closePopup}
              className="popup-close"
              size="1.5em" // Adjust size as needed
            />
            <div className="album-section">
              <div 
                className="album-display"
                ref={albumRef}
                onClick={handleAlbumClick}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                <img 
                  src={albumInfo.cover} 
                  alt={albumInfo.title} 
                  className="album-cover"
                  draggable={false}
                />
                {stickerPos && (
                  <img
                    src={sticker || 'default-sticker.png'}
                    alt="Sticker"
                    className={`sticker ${isDragging ? 'dragging' : ''}`}
                    style={getStickerDisplayStyle()}
                    onMouseDown={handleStickerMouseDown}
                    draggable={false}
                  />
                )}
              </div>
              <p className="album-info">
                <strong>{albumInfo.artist} - {albumInfo.title}</strong>
              </p>
              <p className="instructions">
                Click on the album cover to place your sticker, or drag the sticker to move it around
              </p>
            </div>
            <div className="sticker-controls" onClick={(e) => e.stopPropagation()}>
              <MessageTextBox
                placeholder="Write something to go with your sticker..."
                value={stickerText}
                onChange={(text) => setStickerText(text)}
                onSend={handleSubmit} // Use the send button for submitting
                disabled={isSubmitting}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlaceSticker;