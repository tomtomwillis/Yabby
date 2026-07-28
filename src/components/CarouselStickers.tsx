import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Button from './basic/Button';
import UserMessage from './basic/UserMessages';
import PlaceSticker from './PlaceSticker';
import StickerAlbumPlayer, { StickerFavoritePlay } from './StickerAlbumPlayer';
import './CarouselStickers.css';
import AnchoredBubble from './basic/AnchoredBubble';
import {
  collection,
  query,
  orderBy,
  doc,
  documentId,
  endBefore,
  limit,
  startAt,
  where,
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import {
  trackedGetDocs as getDocs,
  trackedDeleteDoc as deleteDoc,
} from '../utils/firestoreMetrics';
import { useAdmin } from '../utils/useAdmin';
import { getUserData } from '../utils/userCache';

interface Sticker {
  stickerId: string;
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
    stickerId: string;
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
  /** The tile the bubble hangs beneath. */
  anchor: HTMLElement | null;
}

export interface InjectStickerInput {
  stickerId?: string;
  userId: string;
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  albumCover: string;
  text: string;
  position: { x: number; y: number };
  sticker: string;
  favoriteTrackId?: string;
  favoriteTrackTitle?: string;
}

export interface CarouselStickersHandle {
  injectSticker: (input: InjectStickerInput) => void;
  refetch: () => void;
}

// Standard dimensions for consistent rendering
const ALBUM_DISPLAY_SIZE = 300;
const STICKER_SIZE = 100;
// Scan stickers to identify which albums to show. One window either way, so a
// load costs the same whichever order is asked for.
const RECENT_STICKERS_SCAN_LIMIT = 50;
const ALBUMS_IN_CAROUSEL = 16;

/** Firestore's auto-ID alphabet. A key drawn from it lands uniformly among the
 *  existing document IDs, so a window starting there is a random slice of the
 *  collection — no extra field, no extra reads, no index. */
const AUTO_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function randomDocId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => AUTO_ID_CHARS[b % AUTO_ID_CHARS.length]).join('');
}

export type StickerOrder = 'recent' | 'random';

interface CarouselStickersProps {
  order?: StickerOrder;
}

const CarouselStickers = forwardRef<CarouselStickersHandle, CarouselStickersProps>(({
  order = 'recent',
}, ref) => {
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
    anchor: null,
  });

  // The bubble is placed against the wall, so it needs the wall's box.
  const wallRef = useRef<HTMLDivElement>(null);
  const [placeStickerVisible, setPlaceStickerVisible] = useState(false);
  const [selectedAlbumForSticker, setSelectedAlbumForSticker] = useState<{
    id: string;
    artist: string;
    title: string;
    cover: string;
  } | null>(null);

  const { isAdmin } = useAdmin();

  const fetchStickers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
      const API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
      const SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
      const CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID;

      // Step 1: scan a window of stickers to pick the albums to show. Insertion
      // order into the map is the order they end up on the wall.
      const stickers = collection(db, 'stickers');
      let scanned;
      if (order === 'random') {
        const from = randomDocId();
        scanned = (
          await getDocs(
            query(stickers, orderBy(documentId()), startAt(from), limit(RECENT_STICKERS_SCAN_LIMIT)),
          )
        ).docs;
        // The window runs off the end of the collection when the random key
        // lands near it, so wrap back round to the start for the shortfall.
        if (scanned.length < RECENT_STICKERS_SCAN_LIMIT) {
          const wrapped = await getDocs(
            query(
              stickers,
              orderBy(documentId()),
              endBefore(from),
              limit(RECENT_STICKERS_SCAN_LIMIT - scanned.length),
            ),
          );
          scanned = [...scanned, ...wrapped.docs];
        }
      } else {
        scanned = (
          await getDocs(query(stickers, orderBy('timestamp', 'desc'), limit(RECENT_STICKERS_SCAN_LIMIT)))
        ).docs;
      }

      const albumOrder: string[] = [];
      const seenAlbums = new Set<string>();
      for (const d of scanned) {
        const albumId = (d.data() as { albumId: string }).albumId;
        if (!seenAlbums.has(albumId)) {
          seenAlbums.add(albumId);
          albumOrder.push(albumId);
          if (albumOrder.length >= ALBUMS_IN_CAROUSEL) break;
        }
      }

      if (albumOrder.length === 0) {
        setAlbums([]);
        return;
      }

      // Step 2: fetch ALL stickers for the selected albums in one query.
      // Firestore `in` supports up to 30 values — 16 is well within the limit.
      const fullQuery = query(stickers, where('albumId', 'in', albumOrder));
      const fullSnapshot = await getDocs(fullQuery);

      const stickersByAlbum = new Map<string, Sticker[]>();
      for (const d of fullSnapshot.docs) {
        const sticker: Sticker = {
          ...(d.data() as Omit<Sticker, 'stickerId'>),
          stickerId: d.id,
        };
        const list = stickersByAlbum.get(sticker.albumId);
        if (list) list.push(sticker);
        else stickersByAlbum.set(sticker.albumId, [sticker]);
      }

      // Sort each album's stickers newest-first.
      for (const list of stickersByAlbum.values()) {
        list.sort((a, b) => {
          const ta = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
          const tb = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
          return tb - ta;
        });
      }

      const albumsWithStickers: AlbumWithStickers[] = await Promise.all(
        albumOrder.map(async (albumId) => {
          const stickers = stickersByAlbum.get(albumId) || [];

          const response = await fetch(
            `${SERVER_URL}/rest/getAlbum?id=${albumId}&u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`,
            {
              headers: {
                Authorization: 'Basic ' + btoa(`${API_USERNAME}:${API_PASSWORD}`),
              },
            },
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
            'coverArt',
          )}&u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`;

          return {
            albumId,
            albumCover,
            albumTitle: albumElement.getAttribute('name') || 'Unknown Album',
            albumArtist: albumElement.getAttribute('artist') || 'Unknown Artist',
            stickers,
          };
        }),
      );

      setAlbums(albumsWithStickers);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching stickers:', errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [order]);

  useEffect(() => {
    // PrivateRoute guarantees auth by the time this renders; fetch directly.
    fetchStickers();
  }, [fetchStickers]);

  const injectStickerLocal = useCallback((input: InjectStickerInput) => {
    const optimisticSticker: Sticker = {
      stickerId: input.stickerId || `optimistic-${Date.now()}`,
      userId: input.userId,
      albumId: input.albumId,
      text: input.text,
      position: input.position,
      sticker: input.sticker,
      timestamp: { toDate: () => new Date(), seconds: Math.floor(Date.now() / 1000) },
      favoriteTrackId: input.favoriteTrackId,
      favoriteTrackTitle: input.favoriteTrackTitle,
    };

    setAlbums((prev) => {
      const existingIdx = prev.findIndex((a) => a.albumId === input.albumId);
      if (existingIdx >= 0) {
        const updated = [...prev];
        const existing = updated[existingIdx];
        updated[existingIdx] = {
          ...existing,
          stickers: [optimisticSticker, ...existing.stickers],
        };
        // Move this album to the front (most recent activity)
        const [movedAlbum] = updated.splice(existingIdx, 1);
        return [movedAlbum, ...updated];
      }
      return [
        {
          albumId: input.albumId,
          albumCover: input.albumCover,
          albumTitle: input.albumTitle,
          albumArtist: input.albumArtist,
          stickers: [optimisticSticker],
        },
        ...prev,
      ].slice(0, ALBUMS_IN_CAROUSEL);
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      injectSticker: injectStickerLocal,
      refetch: () => {
        fetchStickers();
      },
    }),
    [injectStickerLocal, fetchStickers],
  );

  const handleInternalStickerSuccess = (payload: InjectStickerInput) => {
    injectStickerLocal(payload);
    fetchStickers();
    closePopup();
  };

  const handleAlbumClick = async (album: AlbumWithStickers, anchor: HTMLElement) => {
    const API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
    const API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
    const SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
    const CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID;

    setPopup({
      anchor,
      stickers: await Promise.all(
        album.stickers.map(async (sticker) => {
          const userData = await getUserData(sticker.userId);
          const timestamp = sticker.timestamp?.toDate
            ? sticker.timestamp.toDate().toLocaleString()
            : 'Unknown time';
          return {
            stickerId: sticker.stickerId,
            userId: sticker.userId,
            text: sticker.text,
            username: userData.username,
            avatar: `/Stickers/${sticker.sticker.split('/').pop()}`,
            timestamp: timestamp,
            favoriteTrackId: sticker.favoriteTrackId,
            favoriteTrackTitle: sticker.favoriteTrackTitle,
          };
        }),
      ),
      visible: true,
      albumId: album.albumId,
      albumTitle: album.albumTitle,
      albumArtist: album.albumArtist,
      albumCover: `${SERVER_URL}/rest/getCoverArt?id=${album.albumId}&u=${API_USERNAME}&p=${API_PASSWORD}&v=1.16.1&c=${CLIENT_ID}`,
    });
  };

  const handleDeleteSticker = async (stickerId: string) => {
    if (!window.confirm('Are you sure you want to delete this sticker? This cannot be undone.')) return;

    try {
      await deleteDoc(doc(db, 'stickers', stickerId));
      setPopup((prev) => ({
        ...prev,
        stickers: prev.stickers.filter((s) => s.stickerId !== stickerId),
      }));
      fetchStickers();
    } catch (error) {
      console.error('Error deleting sticker:', error);
      alert('Failed to delete sticker. Please try again.');
    }
  };

  // Stable identity — AnchoredBubble subscribes to it for outside clicks.
  const closePopup = useCallback(() => {
    setPopup({
      stickers: [], visible: false, albumId: '', albumTitle: '', albumArtist: '', albumCover: '', anchor: null,
    });
    setPlaceStickerVisible(false);
    setSelectedAlbumForSticker(null);
  }, []);

  const handlePlaceStickerClick = () => {
    setSelectedAlbumForSticker({
      id: popup.albumId,
      title: popup.albumTitle,
      artist: popup.albumArtist,
      cover: popup.albumCover,
    });
    setPlaceStickerVisible(true);
    setPopup({ ...popup, visible: false });
  };

  const handleBackToPopup = () => {
    setPlaceStickerVisible(false);
    setSelectedAlbumForSticker(null);
    setPopup({ ...popup, visible: true });
  };

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

  const stickerTiles = albums.map((album) => (
    <div key={album.albumId} className="sticker-tile">
      <div
        className="album-card"
        onClick={(e) => handleAlbumClick(album, e.currentTarget)}
        style={{ position: 'relative', cursor: 'pointer' }}
        title={`${album.albumTitle} — ${album.albumArtist}`}
      >
        <img
          src={album.albumCover}
          alt={album.albumTitle}
          className="album-image"
          loading="lazy"
        />
        {album.stickers.map((sticker, index) => {
          const stickerElement = document.querySelector(
            `[data-album-id="${album.albumId}"] .album-image`,
          ) as HTMLElement;

          return (
            <img
              key={index}
              src={`/Stickers/${sticker.sticker.split('/').pop()}`}
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
    <div className="sticker-album-carousel" ref={wallRef}>
      <div className="sticker-wall">
        {stickerTiles}
      </div>

      {popup.visible && (
        <AnchoredBubble anchor={popup.anchor} container={wallRef.current} onClose={closePopup}>
          <h3 className="sb-title">{popup.albumTitle}</h3>
          <p className="sb-artist">{popup.albumArtist}</p>
          <div className="sb-buttons">
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
                  message={sticker.text}
                  timestamp={sticker.timestamp}
                  userSticker={sticker.avatar}
                  userId={sticker.userId}
                  currentUserId={auth.currentUser?.uid}
                  isAdmin={isAdmin}
                  onDelete={
                    (sticker.userId === auth.currentUser?.uid || isAdmin)
                      ? () => handleDeleteSticker(sticker.stickerId)
                      : undefined
                  }
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
        </AnchoredBubble>
      )}

      <PlaceSticker
        mode="popup"
        albumInfo={selectedAlbumForSticker || undefined}
        isVisible={placeStickerVisible}
        onClose={closePopup}
        onBack={handleBackToPopup}
        showBackButton={true}
        onSuccess={handleInternalStickerSuccess}
      />
    </div>
  );
});

CarouselStickers.displayName = 'CarouselStickers';

export default CarouselStickers;
