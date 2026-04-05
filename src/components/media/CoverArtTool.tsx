import React, { useState } from 'react';
import AlbumSearchBox from '../basic/AlbumSearchBox';
import Button from '../basic/Button';
import { useRateLimit } from '../../utils/useRateLimit';
import { validateUrl } from '../../utils/sanitise';
import { auth } from '../../firebaseConfig';
import './CoverArtTool.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlbumInfo {
  id: string;
  artist: string;
  title: string;
  cover: string;
}

type Stage = 'search' | 'preview' | 'processing' | 'success' | 'error';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL || '/api/media';

const NAVIDROME_SERVER_URL = import.meta.env.VITE_NAVIDROME_SERVER_URL;
const NAVIDROME_API_USERNAME = import.meta.env.VITE_NAVIDROME_API_USERNAME;
const NAVIDROME_API_PASSWORD = import.meta.env.VITE_NAVIDROME_API_PASSWORD;
const NAVIDROME_CLIENT_ID = import.meta.env.VITE_NAVIDROME_CLIENT_ID;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CoverArtTool: React.FC = () => {
  const { checkRateLimit } = useRateLimit({ maxAttempts: 5, windowMs: 10 * 60 * 1000 });

  const [selectedAlbum, setSelectedAlbum] = useState<AlbumInfo | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreviewValid, setImagePreviewValid] = useState(false);
  const [imagePreviewError, setImagePreviewError] = useState(false);
  const [stage, setStage] = useState<Stage>('search');
  const [statusMessage, setStatusMessage] = useState('');
  const [resultDetails, setResultDetails] = useState<string>('');

  // -------------------------------------------------------------------------
  // Album fetching
  // -------------------------------------------------------------------------

  const extractAlbumId = (url: string): string | null => {
    const match = url.match(/album\/(.*?)\/show/);
    return match ? match[1] : null;
  };

  const fetchAlbumInfoById = async (albumId: string): Promise<AlbumInfo | null> => {
    try {
      const response = await fetch(
        `${NAVIDROME_SERVER_URL}/rest/getAlbum?id=${encodeURIComponent(albumId)}&u=${NAVIDROME_API_USERNAME}&p=${NAVIDROME_API_PASSWORD}&v=1.16.1&c=${NAVIDROME_CLIENT_ID}`,
        {
          headers: {
            Authorization: 'Basic ' + btoa(`${NAVIDROME_API_USERNAME}:${NAVIDROME_API_PASSWORD}`),
          },
        }
      );

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const text = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, 'application/xml');
      const albumElement = xmlDoc.querySelector('album');

      if (!albumElement) throw new Error('Album not found');

      return {
        id: albumElement.getAttribute('id') || '',
        artist: albumElement.getAttribute('artist') || 'Unknown Artist',
        title: albumElement.getAttribute('name') || 'Unknown Album',
        cover: `${NAVIDROME_SERVER_URL}/rest/getCoverArt?id=${encodeURIComponent(albumElement.getAttribute('coverArt') ?? '')}&u=${NAVIDROME_API_USERNAME}&p=${NAVIDROME_API_PASSWORD}&v=1.16.1&c=${NAVIDROME_CLIENT_ID}`,
      };
    } catch (error) {
      console.error('Failed to fetch album info:', error);
      return null;
    }
  };

  const handleAlbumSelect = async (albumId: string) => {
    const albumInfo = await fetchAlbumInfoById(albumId);
    if (albumInfo) {
      setSelectedAlbum(albumInfo);
      setStage('preview');
      setImageUrl('');
      setImagePreviewValid(false);
      setImagePreviewError(false);
      setStatusMessage('');
      setResultDetails('');
    } else {
      alert('Failed to fetch album information');
    }
  };

  const handleUrlSubmit = async (url: string) => {
    const albumId = extractAlbumId(url);
    if (!albumId) {
      alert('Invalid Navidrome album URL');
      return;
    }
    await handleAlbumSelect(albumId);
  };

  // -------------------------------------------------------------------------
  // Image URL handling
  // -------------------------------------------------------------------------

  const handleImageUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setImageUrl(url);
    setImagePreviewValid(false);
    setImagePreviewError(false);
  };

  const handleImageLoad = () => {
    setImagePreviewValid(true);
    setImagePreviewError(false);
  };

  const handleImageError = () => {
    setImagePreviewValid(false);
    setImagePreviewError(true);
  };


  // -------------------------------------------------------------------------
  // Submit cover art update
  // -------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!selectedAlbum || !imageUrl || !imagePreviewValid) return;

    if (!checkRateLimit()) {
      setStage('error');
      setStatusMessage('Too many requests. Please wait a few minutes before trying again.');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setStage('error');
      setStatusMessage('You must be logged in.');
      return;
    }

    setStage('processing');
    setStatusMessage('Fetching and processing image...');

    try {
      const idToken = await user.getIdToken(true);

      const response = await fetch(`${MEDIA_API_URL}/update-cover`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          albumId: selectedAlbum.id,
          imageUrl: imageUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unknown server error.');
      }

      setStage('success');
      setStatusMessage(data.message || 'Cover art updated successfully!');
      setResultDetails(
        `Format: ${data.details?.originalFormat} → JPEG | ` +
        `Original: ${data.details?.originalDimensions} | ` +
        `Saved: ${(data.details?.processedSize / 1024).toFixed(0)} KB`
      );
    } catch (error: any) {
      setStage('error');
      setStatusMessage(error.message || 'An unexpected error occurred.');
    }
  };

  // -------------------------------------------------------------------------
  // Reset / go back
  // -------------------------------------------------------------------------

  const handleReset = () => {
    setSelectedAlbum(null);
    setImageUrl('');
    setImagePreviewValid(false);
    setImagePreviewError(false);
    setStage('search');
    setStatusMessage('');
    setResultDetails('');
  };

  const handleBackToPreview = () => {
    setStage('preview');
    setStatusMessage('');
    setResultDetails('');
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="coverart-tool">

      {/* ---- STAGE: SEARCH ---- */}
      {stage === 'search' && (
        <>
          <p className="coverart-hint">
            Search for an album to update its cover art.
          </p>
          <AlbumSearchBox
            placeholder="Search for an album or paste a Navidrome URL..."
            onAlbumSelect={handleAlbumSelect}
            onUrlSubmit={handleUrlSubmit}
          />
        </>
      )}

      {/* ---- STAGE: PREVIEW ---- */}
      {stage === 'preview' && selectedAlbum && (
        <>
          <div className="coverart-album-card">
            <img
              src={selectedAlbum.cover}
              alt={`${selectedAlbum.title} current cover`}
              className="coverart-album-thumb"
            />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div className="coverart-album-title">{selectedAlbum.title}</div>
              <div className="coverart-album-artist">{selectedAlbum.artist}</div>
              <div style={{ marginTop: '12px' }}>
                <Button type="basic" label="← Change Album" onClick={handleReset} size="2em" />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="coverart-label">Paste a link to the new cover image:</label>
            <input
              type="text"
              value={imageUrl}
              onChange={handleImageUrlChange}
              placeholder="https://example.com/cover.jpg"
              className="coverart-input"
            />
          </div>

          {imageUrl && validateUrl(imageUrl) && (
            <div style={{ marginBottom: '20px' }}>
              <p className="coverart-preview-label">Preview:</p>
              <div
                className="coverart-preview-box"
                style={{
                  borderColor: imagePreviewValid
                    ? 'var(--colour1)'
                    : imagePreviewError
                      ? 'var(--colour3)'
                      : 'var(--colour2)',
                  borderWidth: imagePreviewValid || imagePreviewError ? '2px' : '1px',
                }}
              >
                {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                <img
                  src={imageUrl}
                  alt="New cover preview"
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                  style={{
                    maxWidth: '200px',
                    maxHeight: '200px',
                    borderRadius: '4px',
                    display: imagePreviewError ? 'none' : 'block',
                  }}
                />
                {imagePreviewError && (
                  <p className="coverart-preview-error">
                    Unable to load image. Check the URL and try again.
                  </p>
                )}
              </div>
            </div>
          )}

          {imagePreviewValid && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Button type="basic" label="Update Cover Art" onClick={handleSubmit} />
            </div>
          )}
        </>
      )}

      {/* ---- STAGE: PROCESSING ---- */}
      {stage === 'processing' && (
        <div className="coverart-status">
          <p className="coverart-status-processing">{statusMessage}</p>
        </div>
      )}

      {/* ---- STAGE: SUCCESS ---- */}
      {stage === 'success' && (
        <div className="coverart-status">
          <p className="coverart-status-success">&#10003; {statusMessage}</p>
          {resultDetails && <p className="coverart-status-details">{resultDetails}</p>}
          <Button type="basic" label="Update Another Album" onClick={handleReset} />
        </div>
      )}

      {/* ---- STAGE: ERROR ---- */}
      {stage === 'error' && (
        <div className="coverart-status">
          <p className="coverart-status-error-title">Error</p>
          <p className="coverart-status-error-msg">{statusMessage}</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Button type="basic" label="← Try Again" onClick={handleBackToPreview} />
            <Button type="basic" label="Start Over" onClick={handleReset} />
          </div>
        </div>
      )}
    </div>
  );
};

export default CoverArtTool;
