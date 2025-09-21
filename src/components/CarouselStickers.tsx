import React, { useEffect, useState, useRef } from 'react';
import { Carousel } from './basic/Carousel';
import Button from './basic/Button';
import UserMessage from './basic/UserMessages';
import TextBox from './basic/MessageTextBox';
import './CarouselStickers.css';
import { collection, getDocs, query, orderBy, doc, getDoc, limit, addDoc, serverTimestamp, where } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

interface Sticker {
  userId: string;
  albumId: string;
  text: string;
  position: { x: number; y: number };
  sticker: string;
  timestamp: any;
}

interface AlbumWithStickers {
  albumId: string;
  albumCover: string;
  albumTitle: string;
  albumArtist: string;
  stickers: Sticker[];
}

interface PopupData {
  stickers: {
    text: string;
    username: string;
    avatar: string;
    timestamp: string;
  }[];
  visible: boolean;
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  albumCover: string;
}

// Standard dimensions for consistent rendering
const ALBUM_DISPLAY_SIZE = 300;
const STICKER_SIZE = 100;

const CarouselStickers: React.FC = () => {
  const [albums, setAlbums] = useState<AlbumWithStickers[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupData>({
    stickers: [],
    visible: false,
    albumId: '',
    albumTitle: '',
    albumArtist: '',
    albumCover: '',
  });
  
  // States for PlaceSticker functionality
  const [showPlaceSticker, setShowPlaceSticker] = useState(false);
  const [stickerText, setStickerText] = useState('');
  const [stickerPos, setStickerPos] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [userSticker, setUserSticker] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const albumRef = useRef<HTMLDivElement>(null);

  const fetchStickers = async () => {
    try {
      setLoading(true);
      setError(null);

      const API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
      const API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
      const SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
      const CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID; // Use the client ID from .env

      // Step 1: Fetch the 10 most recent stickers to determine which albums to show
      const recentStickersQuery = query(
        collection(db, 'stickers'),
        orderBy('timestamp', 'desc'),
        limit(10)
      );
      const recentStickersSnapshot = await getDocs(recentStickersQuery);
      const recentStickers: Sticker[] = recentStickersSnapshot.docs.map((doc) => doc.data() as Sticker);

      // Step 2: Get unique album IDs from the recent stickers
      const uniqueAlbumIds = [...new Set(recentStickers.map(sticker => sticker.albumId))];

      // Step 3: For each album, fetch ALL stickers for that album
      const albumsWithAllStickers: AlbumWithStickers[] = await Promise.all(
        uniqueAlbumIds.map(async (albumId) => {
          // Fetch all stickers for this specific album
          const albumStickersQuery = query(
            collection(db, 'stickers'),
            where('albumId', '==', albumId)
          );
          const albumStickersSnapshot = await getDocs(albumStickersQuery);
          const allAlbumStickers: Sticker[] = albumStickersSnapshot.docs
            .map((doc) => doc.data() as Sticker)
            .sort((a, b) => {
              // Sort by timestamp descending (most recent first)
              const timestampA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(0);
              const timestampB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(0);
              return timestampB.getTime() - timestampA.getTime();
            });

          // Fetch album details from Navidrome API
          const response = await fetch(
            `${SERVER_URL}/rest/getAlbum?id=${albumId}&u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`,
            {
              headers: {
                Authorization: 'Basic ' + btoa(`${API_USERNAME}:${API_PASSWORD}`),
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

          const albumCover = `${SERVER_URL}/rest/getCoverArt?id=${albumElement.getAttribute(
            'coverArt'
          )}&u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`;

          return {
            albumId,
            albumCover,
            albumTitle: albumElement.getAttribute('name') || 'Unknown Album',
            albumArtist: albumElement.getAttribute('artist') || 'Unknown Artist',
            stickers: allAlbumStickers, // Now contains ALL stickers for this album
          };
        })
      );

      setAlbums(albumsWithAllStickers);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching stickers:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      console.log('Auth state changed, user:', user);
      if (user) {
        console.log('User authenticated, fetching stickers...');
        fetchStickers();
      } else {
        console.log('No user authenticated');
        setLoading(false);
        setError('Please log in to view stickers');
      }
    });

    return () => unsubscribe();
  }, []);

  // Fetch user's sticker/avatar
  const fetchUserSticker = async () => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userDoc = doc(db, 'users', user.uid);
      const docSnap = await getDoc(userDoc);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const stickerFilename = data.avatar?.split('/').pop(); // Extract the filename
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

  const handleAlbumClick = async (album: AlbumWithStickers) => {
    const API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
    const API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
    const SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
    const CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID; // Use the client ID from .env

    setPopup({
      stickers: await Promise.all(
        album.stickers.map(async (sticker) => {
          try {
            const userDoc = doc(db, 'users', sticker.userId);
            const userSnapshot = await getDoc(userDoc);

            const userData = userSnapshot.exists()
              ? userSnapshot.data()
              : { username: 'Anonymous', avatar: 'default-avatar.png' };

            const timestamp = sticker.timestamp?.toDate
              ? sticker.timestamp.toDate().toLocaleString()
              : 'Unknown time';

            return {
              text: sticker.text,
              username: userData.username || 'Anonymous',
              avatar: `/Stickers/${sticker.sticker.split('/').pop()}`,
              timestamp: timestamp,
            };
          } catch (error) {
            console.error('Error fetching user data:', error);
            return {
              text: sticker.text,
              username: 'Anonymous',
              avatar: '/Stickers/avatar_tp_red.webp',
              timestamp: 'Unknown time',
            };
          }
        })
      ),
      visible: true,
      albumId: album.albumId,
      albumTitle: album.albumTitle,
      albumArtist: album.albumArtist,
      albumCover: `${SERVER_URL}/rest/getCoverArt?id=${album.albumId}&u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`, // Updated to use CLIENT_ID
    });
  };

  const closePopup = () => {
    setPopup({ stickers: [], visible: false, albumId: '', albumTitle: '', albumArtist: '', albumCover: '' });
    setShowPlaceSticker(false);
    setStickerText('');
    setStickerPos(null);
    setIsDragging(false);
    setIsSubmitting(false);
  };

  const handlePlaceStickerClick = () => {
    setShowPlaceSticker(true);
    setStickerPos(null);
    setStickerText('');
  };

  const handleBackToPopup = () => {
    setShowPlaceSticker(false);
    setStickerPos(null);
    setStickerText('');
  };

  // Convert normalized position to display coordinates for any container size
  const getStickerStyle = (position: { x: number; y: number }, containerElement: HTMLElement | null) => {
    if (!containerElement) {
      const xPercent = (position.x / ALBUM_DISPLAY_SIZE) * 100;
      const yPercent = (position.y / ALBUM_DISPLAY_SIZE) * 100;
      const sizePercent = (STICKER_SIZE / ALBUM_DISPLAY_SIZE) * 100;
      
      return {
        left: `${xPercent}%`,
        top: `${yPercent}%`,
        width: `${sizePercent}%`,
        height: `${sizePercent}%`,
        transform: 'translate(-50%, -50%)',
      };
    }

    const scaleX = containerElement.offsetWidth / ALBUM_DISPLAY_SIZE;
    const scaleY = containerElement.offsetHeight / ALBUM_DISPLAY_SIZE;
    
    const actualX = position.x * scaleX;
    const actualY = position.y * scaleY;
    const actualSize = STICKER_SIZE * Math.min(scaleX, scaleY);

    return {
      left: `${actualX}px`,
      top: `${actualY}px`,
      width: `${actualSize}px`,
      height: `${actualSize}px`,
      transform: 'translate(-50%, -50%)',
    };
  };

  // PlaceSticker functionality
  const screenToAlbumCoords = (screenX: number, screenY: number, albumRect: DOMRect) => {
    const relativeX = screenX - albumRect.left;
    const relativeY = screenY - albumRect.top;
    
    const normalizedX = (relativeX / albumRect.width) * ALBUM_DISPLAY_SIZE;
    const normalizedY = (relativeY / albumRect.height) * ALBUM_DISPLAY_SIZE;
    
    const halfSticker = STICKER_SIZE / 2;
    const clampedX = Math.max(halfSticker, Math.min(ALBUM_DISPLAY_SIZE - halfSticker, normalizedX));
    const clampedY = Math.max(halfSticker, Math.min(ALBUM_DISPLAY_SIZE - halfSticker, normalizedY));
    
    return { x: clampedX, y: clampedY };
  };

  const albumToScreenCoords = (albumX: number, albumY: number) => {
    const xPercent = (albumX / ALBUM_DISPLAY_SIZE) * 100;
    const yPercent = (albumY / ALBUM_DISPLAY_SIZE) * 100;
    return { x: xPercent, y: yPercent };
  };

  const handleAlbumClick_PlaceSticker = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging) return;
    
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const normalizedPos = screenToAlbumCoords(e.clientX, e.clientY, rect);
    setStickerPos(normalizedPos);
  };

  const handleStickerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!albumRef.current || !stickerPos) return;

    const albumRect = albumRef.current.getBoundingClientRect();
    const stickerScreenPos = albumToScreenCoords(stickerPos.x, stickerPos.y);
    
    const stickerCenterX = albumRect.left + (stickerScreenPos.x / 100) * albumRect.width;
    const stickerCenterY = albumRect.top + (stickerScreenPos.y / 100) * albumRect.height;
    
    const offsetX = e.clientX - stickerCenterX;
    const offsetY = e.clientY - stickerCenterY;
    
    setDragOffset({ x: offsetX, y: offsetY });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !albumRef.current) return;

    const rect = albumRef.current.getBoundingClientRect();
    const adjustedX = e.clientX - dragOffset.x;
    const adjustedY = e.clientY - dragOffset.y;
    
    const normalizedPos = screenToAlbumCoords(adjustedX, adjustedY, rect);
    setStickerPos(normalizedPos);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragOffset({ x: 0, y: 0 });
  };

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

  // Create carousel slides
  const carouselSlides = albums.map((album) => (
    <div key={album.albumId} className="album-item">
      <div
        className="album-card"
        onClick={() => handleAlbumClick(album)}
        style={{ position: 'relative', cursor: 'pointer' }}
      >
        <img
          src={album.albumCover}
          alt={album.albumTitle}
          className="album-image"
        />
        {album.stickers.map((sticker, index) => {
          const stickerElement = document.querySelector(
            `[data-album-id="${album.albumId}"] .album-image`
          ) as HTMLElement;

          return (
            <img
              key={index}
              src={`/Stickers/${sticker.sticker.split('/').pop()}`} // Extract filename and use correct path
              alt="Sticker"
              className="sticker-overlay"
              style={getStickerStyle(sticker.position, stickerElement)}
              data-album-id={album.albumId}
            />
          );
        })}
      </div>
    </div>
  ));

  if (loading) {
    return (
      <div className="sticker-album-carousel">
        <div className="loading-container">
          <p>Loading albums with stickers...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sticker-album-carousel">
        <div className="error-container">
          <p>Error loading albums: {error}</p>
          <Button 
            type="basic" 
            label="Retry" 
            onClick={() => window.location.reload()} 
          />
        </div>
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div className="sticker-album-carousel">
        <div className="empty-container">
          <p>No albums with stickers found</p>
        </div>
      </div>
    );
  }


  return (
    <div className="sticker-album-carousel">
      <Carousel 
        slides={carouselSlides}
        loop={albums.length > 4}
        autoplay={true}
        autoplayDelay={3000}
      />

      {popup.visible && (
        <div className="popup-overlay" onClick={closePopup}>
          <div className="popup-content" onClick={(e) => e.stopPropagation()}>
            {!showPlaceSticker ? (
              // Original popup content with UserMessage components
              <>
                <h3 className="popup-album-title">{popup.albumTitle}</h3>
                <p className="popup-album-artist">{popup.albumArtist}</p>
                <div className="popup-buttons">
                  <Button
                    type="basic"
                    label="Click to listen"
                    onClick={() => window.open(`${import.meta.env.VITE_NAVIDROME_SERVER_URL}/app/#/album/${popup.albumId}/show`, '_blank')}
                    className="center-button" // Added center-button class
                  />

                  <Button
                    type="basic"
                    label="Place Sticker on Album"
                    onClick={handlePlaceStickerClick}
                    className="center-button" // Added center-button class
                  />
                </div>
                
                <div className="sticker-messages-list">
                  {popup.stickers.map((sticker, index) => (
                    <UserMessage
                      key={index}
                      username={sticker.username}
                      message={sticker.text}
                      timestamp={sticker.timestamp}
                      userSticker={sticker.avatar} 
                      onClose={() => {}} 
                      hideCloseButton={true} 
                    />
                  ))}
                </div>
                
                <Button 
                  type="close" 
                  onClick={closePopup}
                  className="popup-close-button"
                />
              </>
            ) : (
              // PlaceSticker interface
              <>
                <Button 
                  type="arrow-left" 
                  onClick={handleBackToPopup} 
                  className="back-button" 
                />
                <h3 className="popup-album-title">Place Sticker</h3>
                <p className="popup-album-artist">{popup.albumArtist} - {popup.albumTitle}</p>
                
                <div className="album-section">
                  <div 
                    className="album-display"
                    ref={albumRef}
                    onClick={handleAlbumClick_PlaceSticker}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                  >
                    <img 
                      src={popup.albumCover} 
                      alt={popup.albumTitle} 
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
                  <p className="instructions">
                    Click on the album cover to place your sticker, or drag the sticker to move it around
                  </p>
                </div>

                <div className="sticker-controls" onClick={(e) => e.stopPropagation()}>
                  <TextBox
                    placeholder="Write something to go with your sticker..."
                    value={stickerText}
                    onChange={(text) => setStickerText(text)}
                    onSend={async (text) => {
                      if (!auth.currentUser || !popup.albumId || !stickerPos || !userSticker) {
                        return alert('Please complete all fields before submitting.');
                      }

                      if (isSubmitting) {
                        return;
                      }

                      setIsSubmitting(true);

                      try {
                        await addDoc(collection(db, 'stickers'), {
                          userId: auth.currentUser.uid,
                          albumId: popup.albumId,
                          text: text.trim(),
                          position: {
                            x: stickerPos.x,
                            y: stickerPos.y,
                          },
                          sticker: userSticker,
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
                    }}
                    maxWords={100} // Adjust the maxWords as needed
                    showSendButton={true} // Enable the send button
                    showCounter={true} // Show the word/character counter
                    className="sticker-textbox"
                  />
                </div>
                <Button 
                  type="close" 
                  onClick={closePopup} 
                  className="popup-close-button"
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CarouselStickers;