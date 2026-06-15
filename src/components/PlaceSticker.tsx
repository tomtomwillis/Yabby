// PlaceSticker.tsx
// Wrapper component providing three modes for sticker placement
import React, { useState } from 'react';
import './PlaceSticker.css';
import PlaceStickerCore, { type PlacedStickerPayload } from './PlaceStickerCore';
import AlbumSearchBox from './basic/AlbumSearchBox';
import { fetchSubsonicXml, coverArtUrl } from '../utils/navidrome';

interface AlbumInfo {
  id: string;
  artist: string;
  title: string;
  cover: string;
}

interface PlaceStickerProps {
  mode?: 'url-input' | 'popup' | 'inline-url';
  // For 'popup' mode (pre-loaded album from Carousel/Grid)
  albumInfo?: AlbumInfo;
  isVisible?: boolean;
  onClose?: () => void;
  onBack?: () => void;
  showBackButton?: boolean;
  onSuccess?: (payload: PlacedStickerPayload) => void;
}

const PlaceSticker: React.FC<PlaceStickerProps> = ({
  mode = 'url-input',
  albumInfo: externalAlbumInfo,
  isVisible = false,
  onClose,
  onBack,
  showBackButton = false,
  onSuccess,
}) => {
  const [internalAlbumInfo, setInternalAlbumInfo] = useState<AlbumInfo | null>(null);
  const [showPopup, setShowPopup] = useState(false);

  const extractAlbumId = (url: string): string | null => {
    const match = url.match(/album\/(.*?)\/show/);
    return match ? match[1] : null;
  };

  const fetchAlbumInfoById = async (albumId: string) => {
    if (!albumId) return alert('Invalid album ID');

    try {
      const xmlDoc = await fetchSubsonicXml('getAlbum', { id: albumId });

      const albumElement = xmlDoc.querySelector('album');
      if (!albumElement) {
        throw new Error('Album not found in response');
      }

      setInternalAlbumInfo({
        id: albumElement.getAttribute('id') || '',
        artist: albumElement.getAttribute('artist') || 'Unknown Artist',
        title: albumElement.getAttribute('name') || 'Unknown Album',
        cover: coverArtUrl(albumElement.getAttribute('coverArt') || ''),
      });

      setShowPopup(true);
    } catch (error) {
      alert('Failed to fetch album info');
      console.error(error);
    }
  };

  const handleClosePopup = () => {
    setShowPopup(false);
    setInternalAlbumInfo(null);
  };

  const handleAlbumSelect = async (albumId: string) => {
    await fetchAlbumInfoById(albumId);
  };

  const handleUrlSubmit = async (url: string) => {
    const albumId = extractAlbumId(url);
    if (!albumId) {
      return alert('Invalid Navidrome album URL');
    }
    await fetchAlbumInfoById(albumId);
  };

  // URL Input Mode (Home page)
  if (mode === 'url-input') {
    return (
      <div className="place-sticker-container">
        <h2>Place a Sticker</h2>
        <AlbumSearchBox
          placeholder="Type an album title or paste a Navidrome URL..."
          onAlbumSelect={handleAlbumSelect}
          onUrlSubmit={handleUrlSubmit}
        />

        {showPopup && internalAlbumInfo && (
          <div className="popup-overlay" onClick={handleClosePopup}>
            <div className="popup-content" onClick={(e) => e.stopPropagation()}>
              <PlaceStickerCore
                albumInfo={internalAlbumInfo}
                onClose={handleClosePopup}
                showAlbumInfo={true}
                onSuccess={onSuccess}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Popup Mode (CarouselStickers/StickerGrid)
  if (mode === 'popup') {
    if (!isVisible || !externalAlbumInfo) return null;

    return (
      <div className="popup-overlay" onClick={onClose}>
        <div className="popup-content" onClick={(e) => e.stopPropagation()}>
          <PlaceStickerCore
            albumInfo={externalAlbumInfo}
            onClose={onClose}
            onBack={onBack}
            showBackButton={showBackButton}
            showAlbumInfo={false}
            onSuccess={onSuccess}
          />
        </div>
      </div>
    );
  }

  // Inline URL Mode (Stickers page)
  if (mode === 'inline-url') {
    return (
      <>
        <AlbumSearchBox
          placeholder="Search for an album or paste URL..."
          onAlbumSelect={handleAlbumSelect}
          onUrlSubmit={handleUrlSubmit}
        />

        {showPopup && internalAlbumInfo && (
          <div className="popup-overlay" onClick={handleClosePopup}>
            <div className="popup-content" onClick={(e) => e.stopPropagation()}>
              <PlaceStickerCore
                albumInfo={internalAlbumInfo}
                onClose={handleClosePopup}
                showAlbumInfo={true}
                onSuccess={onSuccess}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export default PlaceSticker;
