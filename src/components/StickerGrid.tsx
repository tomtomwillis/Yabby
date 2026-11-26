import React, { useEffect, useMemo, useState } from 'react';
import Button from './basic/Button';
import UserMessage from './basic/UserMessages';
import PlaceSticker from './PlaceSticker';
import StickerAlbumPlayer, { StickerFavoritePlay } from './StickerAlbumPlayer';
import './StickerGrid.css';
import { auth } from '../firebaseConfig';
import { getAllStickers, type WallSticker as Sticker } from '../utils/stickerWall';
import { getUserData } from '../utils/userCache';
import { musicSessionReady } from '../utils/musicSession';
import { albumCoverUrl, COVER_LARGE, COVER_TILE } from '../utils/navidrome';

interface AlbumWithStickers {
  albumId: string;
  albumCover: string;
  albumTitle: string;
  albumArtist: string;
  stickers: Sticker[];
}

interface PopupData {
  stickers: {
    userId: string;
    text: string;
    username: string;
    avatar: string;
    timestamp: string;
    favoriteTrackId?: string;
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

export interface StickerUser {
  userId: string;
  username: string;
}

interface StickerGridProps {
  sortMode: 'chronological' | 'shuffle';
  shuffleKey: number;
  filterUserId?: string;
  onUsersLoaded?: (users: StickerUser[]) => void;
  /** Changing it fetches the grid again, after a sticker is posted. */
  refreshKey?: number;
}

const ALBUMS_PER_PAGE = 50;

const StickerGrid: React.FC<StickerGridProps> = ({ sortMode, shuffleKey, filterUserId, onUsersLoaded, refreshKey = 0 }) => {
  const [albums, setAlbums] = useState<AlbumWithStickers[]>([]);
  /* Covers that would not load: the album has left the library, or Navidrome
     reissued its id on a rescan. Those tiles drop out of the wall. */
  const [goneAlbums, setGoneAlbums] = useState<ReadonlySet<string>>(new Set());
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

      // Covers are plain <img> requests, so the wall waits for the music cookie
      // too. The two run side by side, and that one is usually already set.
      const [allStickers] = await Promise.all([getAllStickers(), musicSessionReady()]);

      // Group by album. Stickers arrive newest first, so each album's list needs
      // no further reads and a Map's insertion order is already the wall's
      // order: most recent sticker first.
      const stickersByAlbum = new Map<string, Sticker[]>();
      for (const sticker of allStickers) {
        const list = stickersByAlbum.get(sticker.albumId);
        if (list) list.push(sticker);
        else stickersByAlbum.set(sticker.albumId, [sticker]);
      }

      // Every sticker carries its album's name, and a cover needs only the id,
      // so the wall needs no lookup per album. At hundreds of albums those would
      // take far longer than the rest of this put together.
      setAlbums([...stickersByAlbum].map(([albumId, stickers]) => ({
        albumId,
        albumCover: albumCoverUrl(albumId, COVER_TILE),
        albumTitle: stickers[0].albumName || 'Unknown Album',
        albumArtist: stickers[0].albumArtist || 'Unknown Artist',
        stickers,
      })));

      // The filter below needs every poster's name; the wall does not.
      setLoading(false);

      // Build sorted list of unique users who have posted stickers
      if (onUsersLoaded) {
        const uniqueUserIds = [...new Set(allStickers.map(s => s.userId))];
        const userList = await Promise.all(
          uniqueUserIds.map(async (userId) => {
            const data = await getUserData(userId);
            return { userId, username: data.username };
          })
        );
        userList.sort((a, b) => a.username.localeCompare(b.username));
        onUsersLoaded(userList);
      }
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

  useEffect(() => {
    if (refreshKey > 0) fetchStickers();
    // fetchStickers is recreated each render; only a new key should refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // shuffleKey is a dependency so that asking again deals a new order.
  const displayedAlbums = useMemo(() => {
    if (sortMode !== 'shuffle') return albums;
    // Fisher-Yates shuffle algorithm
    const shuffled = [...albums];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, albums, shuffleKey]);

  const handleLoadMore = () => {
    setVisibleCount(prev => prev + ALBUMS_PER_PAGE);
  };

  const filteredAlbums = displayedAlbums.filter(album =>
    !goneAlbums.has(album.albumId)
    && (!filterUserId || album.stickers.some(s => s.userId === filterUserId))
  );
  const visibleAlbums = filteredAlbums.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAlbums.length;

  const handleAlbumClick = async (album: AlbumWithStickers) => {
    setPopup({
      stickers: await Promise.all(
        album.stickers.map(async (sticker) => {
          const userData = await getUserData(sticker.userId);
          const timestamp = sticker.timestamp?.toDate
            ? sticker.timestamp.toDate().toLocaleString()
            : 'Unknown time';
          return {
            userId: sticker.userId,
            text: sticker.text,
            username: userData.username,
            avatar: `/Stickers/${sticker.sticker.split('/').pop()}`,
            timestamp: timestamp,
            favoriteTrackId: sticker.favoriteTrackId,
            favoriteTrackTitle: sticker.favoriteTrackTitle,
          };
        })
      ),
      visible: true,
      albumId: album.albumId,
      albumTitle: album.albumTitle,
      albumArtist: album.albumArtist,
      albumCover: albumCoverUrl(album.albumId, COVER_LARGE),
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

  if (filteredAlbums.length === 0) {
    return (
      <div className="sticker-grid-container">
        <div className="empty-container">
          <p>{filterUserId ? 'No albums found for this user' : 'No albums with stickers found'}</p>
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
                loading="lazy"
                onError={() => setGoneAlbums((gone) => new Set(gone).add(album.albumId))}
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
            label={`Load More (${filteredAlbums.length - visibleCount} remaining)`}
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
                label="Place Sticker on Album"
                onClick={handlePlaceStickerClick}
                className="center-button"
              />

              <StickerAlbumPlayer
                albumId={popup.albumId}
                albumTitle={popup.albumTitle}
                albumArtist={popup.albumArtist}
                favoriteTrackIds={popup.stickers.flatMap(s => (s.favoriteTrackId ? [s.favoriteTrackId] : []))}
              />
            </div>

            <div className="sticker-messages-list">
              {popup.stickers.map((sticker, index) => (
                <div key={index} className="sticker-message-item">
                  <UserMessage
                    username={sticker.username}
                    userId={sticker.userId}
                    message={sticker.text}
                    timestamp={sticker.timestamp}
                    userSticker={sticker.avatar}
                    onClose={() => {}}
                    hideCloseButton={true}
                  />
                  {sticker.favoriteTrackTitle && (
                    <p className="favorite-track-display">
                      🎵 Favorite track: <span className="track-name">{sticker.favoriteTrackTitle}</span>
                      {sticker.favoriteTrackId && (
                        <StickerFavoritePlay
                          albumId={popup.albumId}
                          albumTitle={popup.albumTitle}
                          albumArtist={popup.albumArtist}
                          trackId={sticker.favoriteTrackId}
                          trackTitle={sticker.favoriteTrackTitle}
                        />
                      )}
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
        onSuccess={() => void fetchStickers()}
        onBack={handleBackToPopup}
        showBackButton={true}
      />
    </div>
  );
};

export default StickerGrid;
