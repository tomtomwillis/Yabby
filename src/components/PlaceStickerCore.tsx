// PlaceStickerCore.tsx
// Core sticker placement functionality - shared across all placement modes
import React, { useState, useEffect, useRef } from 'react';
import './PlaceStickerCore.css';
import { db, auth } from '../firebaseConfig';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import MessageTextBox from './basic/MessageTextBox';
import Button from './basic/Button';

interface AlbumInfo {
  id: string;
  artist: string;
  title: string;
  cover: string;
}

interface PlaceStickerCoreProps {
  albumInfo: AlbumInfo;
  onSuccess?: () => void;
  onClose?: () => void;
  showBackButton?: boolean;
  onBack?: () => void;
  showAlbumInfo?: boolean;
}

// Standard album display dimensions for consistent positioning
export const ALBUM_DISPLAY_SIZE = 300;
export const STICKER_SIZE = 100;

const PlaceStickerCore: React.FC<PlaceStickerCoreProps> = ({
  albumInfo,
  onSuccess,
  onClose,
  showBackButton = false,
  onBack,
  showAlbumInfo = false,
}) => {
  const [stickerText, setStickerText] = useState('');
  const [stickerPos, setStickerPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [userSticker, setUserSticker] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const albumRef = useRef<HTMLDivElement>(null);

  // Fetch user's sticker/avatar
  const fetchUserSticker = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userDoc = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDoc);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const stickerFilename = data.avatar?.split('/').pop();
        setUserSticker(stickerFilename ? `/Stickers/${stickerFilename}` : null);
      } else {
        setUserSticker(null);
      }
    } catch (error) {
      console.error('Error fetching user sticker:', error);
    }
  };

  useEffect(() => {
    fetchUserSticker();
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

  // Calculate display position for the sticker
  const getStickerDisplayStyle = () => {
    if (!stickerPos) return {};

    const screenPos = albumToScreenCoords(stickerPos.x, stickerPos.y);
    return {
      left: `${screenPos.x}%`,
      top: `${screenPos.y}%`,
      width: `${(STICKER_SIZE / ALBUM_DISPLAY_SIZE) * 100}%`,
      height: `${(STICKER_SIZE / ALBUM_DISPLAY_SIZE) * 100}%`,
      transform: 'translate(-50%, -50%)',
    };
  };

  // Handle submission
  const handleSubmit = async () => {
    if (!auth.currentUser || !albumInfo || !stickerPos || !stickerText.trim() || !userSticker) {
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
        sticker: userSticker,
        timestamp: serverTimestamp(),
      });

      alert('Sticker placed successfully!');

      // Call onSuccess callback if provided, otherwise reload
      if (onSuccess) {
        onSuccess();
      } else {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error submitting sticker:', error);
      alert('Failed to submit sticker. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {showBackButton && onBack && (
        <Button type="arrow-left" onClick={onBack} className="back-button" />
      )}

      <h3 className="popup-album-title">{showBackButton ? 'Place Sticker' : albumInfo.title}</h3>
      <p className="popup-album-artist">{albumInfo.artist}{showBackButton ? ` - ${albumInfo.title}` : ''}</p>

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
              src={userSticker || 'default-sticker.png'}
              alt="Sticker"
              className={`sticker ${isDragging ? 'dragging' : ''}`}
              style={getStickerDisplayStyle()}
              onMouseDown={handleStickerMouseDown}
              draggable={false}
            />
          )}
        </div>
        {showAlbumInfo && (
          <p className="album-info">
            <strong>
              {albumInfo.artist} - {albumInfo.title}
            </strong>
          </p>
        )}
        <p className="instructions">
          Click on the album cover to place your sticker, or drag the sticker to move it around
        </p>
      </div>

      <div className="sticker-controls" onClick={(e) => e.stopPropagation()}>
        <MessageTextBox
          placeholder="Write something to go with your sticker..."
          value={stickerText}
          onChange={(text) => setStickerText(text)}
          onSend={handleSubmit}
          disabled={isSubmitting}
          maxWords={100}
          showSendButton={true}
          showCounter={true}
        />
      </div>

      {onClose && (
        <Button type="close" onClick={onClose} className="popup-close-button" />
      )}
    </>
  );
};

export default PlaceStickerCore;
