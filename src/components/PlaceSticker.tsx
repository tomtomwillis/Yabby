// PlaceSticker.tsx
// Wrapper component providing three modes for sticker placement
import React, { useState } from 'react';
import './PlaceSticker.css';
import PlaceStickerCore from './PlaceStickerCore';
import MessageTextBox from './basic/MessageTextBox';

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
}

const PlaceSticker: React.FC<PlaceStickerProps> = ({
  mode = 'url-input',
  albumInfo: externalAlbumInfo,
  isVisible = false,
  onClose,
  onBack,
  showBackButton = false,
}) => {
  const [albumURL, setAlbumURL] = useState('');
  const [internalAlbumInfo, setInternalAlbumInfo] = useState<AlbumInfo | null>(null);
  const [showPopup, setShowPopup] = useState(false);

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

      setInternalAlbumInfo({
        id: albumElement.getAttribute('id') || '',
        artist: albumElement.getAttribute('artist') || 'Unknown Artist',
        title: albumElement.getAttribute('name') || 'Unknown Album',
        cover: `${NAVIDROME_SERVER_URL}/rest/getCoverArt?id=${albumElement.getAttribute(
          'coverArt'
        )}&u=${NAVIDROME_API_USERNAME}&p=${NAVIDROME_API_PASSWORD}&v=1.16.1&c=${NAVIDROME_CLIENT_ID}`,
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
    setAlbumURL('');
  };

  // URL Input Mode (Home page)
  if (mode === 'url-input') {
    return (
      <div className="place-sticker-container">
        <h2>Place a Sticker</h2>
        <MessageTextBox
          placeholder="Paste Navidrome album URL..."
          value={albumURL}
          onChange={(text) => setAlbumURL(text)}
          onSend={fetchAlbumInfo}
          showSendButton={true}
          showCounter={false}
        />

        {showPopup && internalAlbumInfo && (
          <div className="popup-overlay" onClick={handleClosePopup}>
            <div className="popup-content" onClick={(e) => e.stopPropagation()}>
              <PlaceStickerCore
                albumInfo={internalAlbumInfo}
                onClose={handleClosePopup}
                showAlbumInfo={true}
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
          />
        </div>
      </div>
    );
  }

  // Inline URL Mode (Stickers page)
  if (mode === 'inline-url') {
    return (
      <>
        <MessageTextBox
          placeholder="Paste Navidrome album URL..."
          value={albumURL}
          onChange={(text) => setAlbumURL(text)}
          onSend={fetchAlbumInfo}
          showSendButton={true}
          showCounter={false}
        />

        {showPopup && internalAlbumInfo && (
          <div className="popup-overlay" onClick={handleClosePopup}>
            <div className="popup-content" onClick={(e) => e.stopPropagation()}>
              <PlaceStickerCore
                albumInfo={internalAlbumInfo}
                onClose={handleClosePopup}
                showAlbumInfo={true}
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
