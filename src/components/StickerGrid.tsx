import React, { useEffect, useState } from 'react';
import Button from './basic/Button';
import UserMessage from './basic/UserMessages';
import PlaceSticker from './PlaceSticker';
import './StickerGrid.css';
import { collection, getDocs, query, orderBy, doc, getDoc, where } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

interface Sticker {
  userId: string;
  albumId: string;
  text: string;
  position: { x: number; y: number };
  sticker: string;
  timestamp: any;
  favoriteTrackId?: string;
  favoriteTrackTitle?: string;
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
    favoriteTrackTitle?: string;
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

interface StickerGridProps {
  sortMode: 'chronological' | 'shuffle';
  shuffleKey: number;
}

const ALBUMS_PER_PAGE = 50;

const StickerGrid: React.FC<StickerGridProps> = ({ sortMode, shuffleKey }) => {
  const [albums, setAlbums] = useState<AlbumWithStickers[]>([]);
  const [displayedAlbums, setDisplayedAlbums] = useState<AlbumWithStickers[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(ALBUMS_PER_PAGE);
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

  // States for PlaceSticker component
  const [placeStickerVisible, setPlaceStickerVisible] = useState(false);
  const [selectedAlbumForSticker, setSelectedAlbumForSticker] = useState<{
    id: string;
    artist: string;
    title: string;
    cover: string;
  } | null>(null);

  const fetchStickers = async () => {
    try {
      setLoading(true);
      setError(null);

      const API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
      const API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
      const SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
      const CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID;

      // Fetch all stickers ordered by timestamp
      const allStickersQuery = query(
        collection(db, 'stickers'),
        orderBy('timestamp', 'desc')
      );
      const allStickersSnapshot = await getDocs(allStickersQuery);
      const allStickers: Sticker[] = allStickersSnapshot.docs.map((doc) => doc.data() as Sticker);

      // Get unique album IDs
      const uniqueAlbumIds = [...new Set(allStickers.map(sticker => sticker.albumId))];

      // For each album, fetch ALL stickers for that album
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

          // Find the most recent sticker timestamp for this album
          const mostRecentTimestamp = allAlbumStickers[0]?.timestamp?.toDate ?
            allAlbumStickers[0].timestamp.toDate().getTime() : 0;

          return {
            albumId,
            albumCover,
            albumTitle: albumElement.getAttribute('name') || 'Unknown Album',
            albumArtist: albumElement.getAttribute('artist') || 'Unknown Artist',
            stickers: allAlbumStickers,
            mostRecentTimestamp, // Add this for sorting
          };
        })
      );

      // Sort by most recent sticker timestamp (chronological by default)
      const sortedAlbums = albumsWithAllStickers.sort((a: any, b: any) =>
        b.mostRecentTimestamp - a.mostRecentTimestamp
      );

      setAlbums(sortedAlbums);
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
      if (user) {
        fetchStickers();
      } else {
        setLoading(false);
        setError('Please log in to view stickers');
      }
    });

    return () => unsubscribe();
  }, []);

  // Handle sort mode changes and shuffle key
  useEffect(() => {
    if (albums.length === 0) return;

    if (sortMode === 'shuffle') {
      // Fisher-Yates shuffle algorithm
      const shuffled = [...albums];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      setDisplayedAlbums(shuffled);
    } else {
      // Chronological (already sorted)
      setDisplayedAlbums(albums);
    }
  }, [sortMode, albums, shuffleKey]);

  const handleLoadMore = () => {
    setVisibleCount(prev => prev + ALBUMS_PER_PAGE);
  };

  const visibleAlbums = displayedAlbums.slice(0, visibleCount);
  const hasMore = visibleCount < displayedAlbums.length;

  const handleAlbumClick = async (album: AlbumWithStickers) => {
    const API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
    const API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
    const SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
    const CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID;

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
              favoriteTrackTitle: sticker.favoriteTrackTitle,
            };
          } catch (error) {
            console.error('Error fetching user data:', error);
            return {
              text: sticker.text,
              username: 'Anonymous',
              avatar: '/Stickers/avatar_tp_red.webp',
              timestamp: 'Unknown time',
              favoriteTrackTitle: sticker.favoriteTrackTitle,
            };
          }
        })
      ),
      visible: true,
      albumId: album.albumId,
      albumTitle: album.albumTitle,
      albumArtist: album.albumArtist,
      albumCover: `${SERVER_URL}/rest/getCoverArt?id=${album.albumId}&u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`,
    });
  };

  const closePopup = () => {
    setPopup({ stickers: [], visible: false, albumId: '', albumTitle: '', albumArtist: '', albumCover: '' });
    setPlaceStickerVisible(false);
    setSelectedAlbumForSticker(null);
  };

  const handlePlaceStickerClick = () => {
    setSelectedAlbumForSticker({
      id: popup.albumId,
      title: popup.albumTitle,
      artist: popup.albumArtist,
      cover: popup.albumCover,
    });
    setPlaceStickerVisible(true);
    setPopup({ ...popup, visible: false }); // Hide the view popup
  };

  const handleBackToPopup = () => {
    setPlaceStickerVisible(false);
    setSelectedAlbumForSticker(null);
    setPopup({ ...popup, visible: true }); // Show view popup again
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

  if (loading) {
    return (
      <div className="sticker-grid-container">
        <div className="loading-container">
          <p>Loading albums with stickers...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sticker-grid-container">
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

  if (displayedAlbums.length === 0) {
    return (
      <div className="sticker-grid-container">
        <div className="empty-container">
          <p>No albums with stickers found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sticker-grid-container">
      <div className="sticker-grid">
        {visibleAlbums.map((album) => (
          <div key={album.albumId} className="grid-album-item">
            <div
              className="grid-album-card"
              onClick={() => handleAlbumClick(album)}
              style={{ position: 'relative', cursor: 'pointer' }}
            >
              <img
                src={album.albumCover}
                alt={album.albumTitle}
                className="grid-album-image"
              />
              {album.stickers.map((sticker, index) => {
                const stickerElement = document.querySelector(
                  `[data-album-id="${album.albumId}"] .grid-album-image`
                ) as HTMLElement;

                return (
                  <img
                    key={index}
                    src={`/Stickers/${sticker.sticker.split('/').pop()}`}
                    alt="Sticker"
                    className="grid-sticker-overlay"
                    style={getStickerStyle(sticker.position, stickerElement)}
                    data-album-id={album.albumId}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="load-more-container">
          <Button
            type="basic"
            label={`Load More (${displayedAlbums.length - visibleCount} remaining)`}
            onClick={handleLoadMore}
          />
        </div>
      )}

      {popup.visible && (
        <div className="popup-overlay" onClick={closePopup}>
          <div className="popup-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="popup-album-title">{popup.albumTitle}</h3>
            <p className="popup-album-artist">{popup.albumArtist}</p>
            <div className="popup-buttons">
              <Button
                type="basic"
                label="Click to listen"
                onClick={() => window.open(`${import.meta.env.VITE_NAVIDROME_SERVER_URL}/app/#/album/${popup.albumId}/show`, '_blank')}
                className="center-button"
              />

              <Button
                type="basic"
                label="Place Sticker on Album"
                onClick={handlePlaceStickerClick}
                className="center-button"
              />
            </div>

            <div className="sticker-messages-list">
              {popup.stickers.map((sticker, index) => (
                <div key={index} className="sticker-message-item">
                  <UserMessage
                    username={sticker.username}
                    message={sticker.text}
                    timestamp={sticker.timestamp}
                    userSticker={sticker.avatar}
                    onClose={() => {}}
                    hideCloseButton={true}
                  />
                  {sticker.favoriteTrackTitle && (
                    <p className="favorite-track-display">
                      🎵 Favorite track: <span className="track-name">{sticker.favoriteTrackTitle}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>

            <Button
              type="close"
              onClick={closePopup}
              className="popup-close-button"
            />
          </div>
        </div>
      )}

      <PlaceSticker
        mode="popup"
        albumInfo={selectedAlbumForSticker || undefined}
        isVisible={placeStickerVisible}
        onClose={closePopup}
        onBack={handleBackToPopup}
        showBackButton={true}
      />
    </div>
  );
};

export default StickerGrid;
