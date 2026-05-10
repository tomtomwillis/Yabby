import React, { useState } from 'react';
import AlbumSearchBox from '../basic/AlbumSearchBox';
import Button from '../basic/Button';
import { useRateLimit } from '../../utils/useRateLimit';
import { validateUrl } from '../../utils/sanitise';
import { auth } from '../../firebaseConfig';
import { useMediaTheme, MEDIA_THEMES } from '../../utils/useMediaTheme';
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
  const { theme, setTheme } = useMediaTheme();

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

  const titlebarText: string = (() => {
    switch (stage) {
      case 'search':     return 'CoverArt v2.0  —  Pick an album';
      case 'preview':    return selectedAlbum ? `CoverArt v2.0  —  ${selectedAlbum.title}.jpg` : 'CoverArt v2.0';
      case 'processing': return 'CoverArt v2.0  —  Processing...';
      case 'success':    return 'CoverArt v2.0  —  Done!';
      case 'error':      return 'CoverArt v2.0  —  Error';
      default:           return 'CoverArt v2.0';
    }
  })();

  const statusbarLeft: string = (() => {
    switch (stage) {
      case 'search':     return 'Ready';
      case 'preview':    return imagePreviewValid ? 'Image preview OK' : imagePreviewError ? 'Image failed to load' : 'Awaiting URL';
      case 'processing': return 'Uploading...';
      case 'success':    return 'Saved';
      case 'error':      return 'Error';
      default:           return 'Ready';
    }
  })();

  const previewBoxClass = 'coverart-preview-box' +
    (imagePreviewValid ? ' coverart-preview-box--valid' : imagePreviewError ? ' coverart-preview-box--error' : '');

  return (
    <div className="mm-tool">
      <div className="mm-window" role="region" aria-label="Cover art tool">
        <div className="mm-titlebar">
          <span className="mm-titlebar-icon" aria-hidden="true">🖼</span>
          <span className="mm-titlebar-title">{titlebarText}</span>
          <span className="mm-titlebar-controls" aria-hidden="true">
            <span className="mm-titlebar-btn">_</span>
            <span className="mm-titlebar-btn">▢</span>
            <span className="mm-titlebar-btn">×</span>
          </span>
        </div>

        <div className="mm-chrome">
          {stage === 'search' && (
            <div className="mm-welcome">
              <p className="mm-welcome-greeting">
                ✧ Pick an album to re-cover ✧
              </p>
              <p className="mm-hint">
                Search for an album, or paste a Navidrome album URL.
              </p>
              <AlbumSearchBox
                placeholder="Search for an album or paste a Navidrome URL..."
                onAlbumSelect={handleAlbumSelect}
                onUrlSubmit={handleUrlSubmit}
              />

              <div className="mm-theme-picker">
                <p className="mm-theme-picker-title">
                  <span className="mm-theme-picker-title-deco" aria-hidden="true">✦</span>
                  Pick your colour scheme
                  <span className="mm-theme-picker-title-deco" aria-hidden="true">✦</span>
                </p>
                <div className="mm-theme-picker-grid" role="radiogroup" aria-label="Colour palette">
                  {MEDIA_THEMES.map((t) => {
                    const active = theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={
                          'mm-theme-btn' +
                          (active ? ' mm-theme-btn--active' : '')
                        }
                        onClick={() => setTheme(t.id)}
                      >
                        <span className="mm-theme-btn-swatch" aria-hidden="true">
                          {t.swatch.map((c, idx) => (
                            <span key={idx} style={{ background: c }} />
                          ))}
                        </span>
                        <span className="mm-theme-btn-name">
                          <span className="mm-theme-btn-star" aria-hidden="true">★</span>
                          {t.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {stage === 'preview' && selectedAlbum && (
            <>
              <div className="coverart-album-card">
                <img
                  src={selectedAlbum.cover}
                  alt={`${selectedAlbum.title} current cover`}
                  className="coverart-album-thumb"
                />
                <div className="coverart-album-meta">
                  <p className="coverart-album-title">{selectedAlbum.title}</p>
                  <p className="coverart-album-artist">{selectedAlbum.artist}</p>
                  <div className="coverart-album-action">
                    <Button type="basic" label="← Change Album" onClick={handleReset} />
                  </div>
                </div>
              </div>

              <div className="coverart-section">
                <label className="mm-label" htmlFor="coverart-url">Paste a link to the new cover image</label>
                <input
                  id="coverart-url"
                  type="text"
                  value={imageUrl}
                  onChange={handleImageUrlChange}
                  placeholder="https://example.com/cover.jpg"
                  className="mm-input"
                />
              </div>

              {imageUrl && validateUrl(imageUrl) && (
                <div className="coverart-section">
                  <p className="coverart-preview-label">Preview</p>
                  <div className={previewBoxClass}>
                    {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
                    <img
                      src={imageUrl}
                      alt="New cover preview"
                      onLoad={handleImageLoad}
                      onError={handleImageError}
                      className="coverart-preview-img"
                      style={{ display: imagePreviewError ? 'none' : 'block' }}
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
                <div className="mm-actions">
                  <span className="mm-btn-primary">
                    <Button type="basic" label="Update Cover Art ✓" onClick={handleSubmit} />
                  </span>
                </div>
              )}
            </>
          )}

          {stage === 'processing' && (
            <div className="mm-status">
              <div className="mm-loader-icon" aria-hidden="true">⌛</div>
              <p className="mm-status-processing">{statusMessage}</p>
              <div className="mm-progress-bar" aria-hidden="true">
                <div className="mm-progress-fill" />
              </div>
            </div>
          )}

          {stage === 'success' && (
            <div className="mm-status">
              <p className="mm-status-success-banner" aria-hidden="true">
                ━━━━━━ SUCCESS! ━━━━━━
              </p>
              <p className="mm-status-success">✓ {statusMessage}</p>
              {resultDetails && <p className="mm-status-details">{resultDetails}</p>}
              <div className="mm-actions">
                <span className="mm-btn-primary">
                  <Button type="basic" label="Update Another Album »" onClick={handleReset} />
                </span>
              </div>
            </div>
          )}

          {stage === 'error' && (
            <div className="mm-status">
              <p className="mm-status-error-title">Error</p>
              <p className="mm-status-error-msg">{statusMessage}</p>
              <div className="mm-actions">
                <Button type="basic" label="← Try Again" onClick={handleBackToPreview} />
                <Button type="basic" label="Start Over" onClick={handleReset} />
              </div>
            </div>
          )}
        </div>

        <div className="mm-statusbar" aria-hidden="true">
          <span className="mm-statusbar-section mm-statusbar-section--grow">
            <span className="mm-statusbar-blip" />
            {statusbarLeft}
          </span>
          <span className="mm-statusbar-section">
            🖼 CoverArt 🖼
          </span>
        </div>
      </div>
    </div>
  );
};

export default CoverArtTool;
