import React, { useState } from 'react';
import Header from '../components/basic/Header';
import AlbumSearchBox from '../components/basic/AlbumSearchBox';
import Button from '../components/basic/Button';
import { useMediaManager } from '../utils/useMediaManager';
import { auth } from '../firebaseConfig';
import '../App.css';

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

const MediaManager: React.FC = () => {
  const { isMediaManager, loading } = useMediaManager();

  const [selectedAlbum, setSelectedAlbum] = useState<AlbumInfo | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreviewValid, setImagePreviewValid] = useState(false);
  const [imagePreviewError, setImagePreviewError] = useState(false);
  const [stage, setStage] = useState<Stage>('search');
  const [statusMessage, setStatusMessage] = useState('');
  const [resultDetails, setResultDetails] = useState<string>('');

  // -------------------------------------------------------------------------
  // Album fetching (same pattern as PlaceSticker / CreateList)
  // -------------------------------------------------------------------------

  const extractAlbumId = (url: string): string | null => {
    const match = url.match(/album\/(.*?)\/show/);
    return match ? match[1] : null;
  };

  const fetchAlbumInfoById = async (albumId: string): Promise<AlbumInfo | null> => {
    try {
      const response = await fetch(
        `${NAVIDROME_SERVER_URL}/rest/getAlbum?id=${albumId}&u=${NAVIDROME_API_USERNAME}&p=${NAVIDROME_API_PASSWORD}&v=1.16.1&c=${NAVIDROME_CLIENT_ID}`,
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
        cover: `${NAVIDROME_SERVER_URL}/rest/getCoverArt?id=${albumElement.getAttribute(
          'coverArt'
        )}&u=${NAVIDROME_API_USERNAME}&p=${NAVIDROME_API_PASSWORD}&v=1.16.1&c=${NAVIDROME_CLIENT_ID}`,
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

  // Basic URL validation before showing preview
  const isValidUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  // -------------------------------------------------------------------------
  // Submit cover art update
  // -------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!selectedAlbum || !imageUrl || !imagePreviewValid) return;

    const user = auth.currentUser;
    if (!user) {
      setStage('error');
      setStatusMessage('You must be logged in.');
      return;
    }

    setStage('processing');
    setStatusMessage('Fetching and processing image...');

    try {
      // Get the Firebase ID token for server-side verification
      const idToken = await user.getIdToken();

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
  // Loading / access denied states
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="app-container">
        <Header title="Media Manager" subtitle="Loading..." />
        <p style={{ textAlign: 'center', color: 'var(--colour2)', padding: '40px' }}>
          Checking permissions...
        </p>
      </div>
    );
  }

  if (!isMediaManager) {
    return (
      <div className="app-container">
        <Header title="Media Manager" subtitle="Access Denied" />
        <p style={{ textAlign: 'center', color: 'var(--colour5)', padding: '40px' }}>
          You do not have media manager permissions.
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="app-container">
      <Header title="Media Manager" subtitle="Update Album Cover Art" />

      <div style={{
        maxWidth: '600px',
        width: '100%',
        margin: '0 auto',
        padding: '0 20px',
      }}>

        {/* ---- STAGE: SEARCH ---- */}
        {stage === 'search' && (
          <>
            <p style={{
              fontFamily: 'var(--font2)',
              color: 'var(--colour5)',
              fontSize: '0.9em',
              marginBottom: '20px',
              textAlign: 'center',
            }}>
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
            {/* Selected album display */}
            <div style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'center',
              marginBottom: '24px',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid var(--colour2)',
            }}>
              <img
                src={selectedAlbum.cover}
                alt={`${selectedAlbum.title} current cover`}
                style={{
                  width: '100px',
                  height: '100px',
                  borderRadius: '4px',
                  objectFit: 'cover',
                }}
              />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  fontWeight: 'bold',
                  color: 'var(--colour5)',
                  fontFamily: 'var(--font1)',
                  fontSize: '1.1em',
                  marginBottom: '4px',
                }}>
                  {selectedAlbum.title}
                </div>
                <div style={{
                  color: 'var(--colour5)',
                  fontFamily: 'var(--font2)',
                  fontSize: '0.9em',
                  opacity: 0.8,
                }}>
                  {selectedAlbum.artist}
                </div>
                <div style={{ marginTop: '12px' }}>
                  <Button
                    type="basic"
                    label="← Change Album"
                    onClick={handleReset}
                    size="2em"
                  />
                </div>
              </div>
            </div>

            {/* Image URL input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{
                fontFamily: 'var(--font2)',
                color: 'var(--colour5)',
                fontSize: '0.9em',
                display: 'block',
                marginBottom: '8px',
                textAlign: 'center',
              }}>
                Paste a link to the new cover image:
              </label>
              <input
                type="text"
                value={imageUrl}
                onChange={handleImageUrlChange}
                placeholder="https://example.com/cover.jpg"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--colour2)',
                  fontFamily: 'var(--font2)',
                  fontSize: '0.9em',
                  color: 'var(--colour5)',
                  backgroundColor: 'transparent',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            {/* Image preview */}
            {imageUrl && isValidUrl(imageUrl) && (
              <div style={{ marginBottom: '20px' }}>
                <p style={{
                  fontFamily: 'var(--font2)',
                  color: 'var(--colour5)',
                  fontSize: '0.85em',
                  marginBottom: '8px',
                  textAlign: 'center',
                }}>
                  Preview:
                </p>
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '12px',
                  borderRadius: '8px',
                  border: imagePreviewValid
                    ? '2px solid var(--colour1)'
                    : imagePreviewError
                      ? '2px solid var(--colour3)'
                      : '1px solid var(--colour2)',
                  minHeight: '100px',
                  alignItems: 'center',
                }}>
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
                    <p style={{
                      color: 'var(--colour3)',
                      fontFamily: 'var(--font2)',
                      fontSize: '0.85em',
                    }}>
                      Unable to load image. Check the URL and try again.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Submit button */}
            {imagePreviewValid && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Button
                  type="basic"
                  label="Update Cover Art"
                  onClick={handleSubmit}
                />
              </div>
            )}
          </>
        )}

        {/* ---- STAGE: PROCESSING ---- */}
        {stage === 'processing' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{
              fontFamily: 'var(--font2)',
              color: 'var(--colour2)',
              fontSize: '1em',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              {statusMessage}
            </p>
          </div>
        )}

        {/* ---- STAGE: SUCCESS ---- */}
        {stage === 'success' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{
              fontFamily: 'var(--font1)',
              color: 'var(--colour1)',
              fontSize: '1.2em',
              fontWeight: 'bold',
              marginBottom: '8px',
            }}>
              ✓ {statusMessage}
            </p>
            {resultDetails && (
              <p style={{
                fontFamily: 'var(--font2)',
                color: 'var(--colour5)',
                fontSize: '0.8em',
                opacity: 0.7,
                marginBottom: '24px',
              }}>
                {resultDetails}
              </p>
            )}
            <Button
              type="basic"
              label="Update Another Album"
              onClick={handleReset}
            />
          </div>
        )}

        {/* ---- STAGE: ERROR ---- */}
        {stage === 'error' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{
              fontFamily: 'var(--font1)',
              color: 'var(--colour3)',
              fontSize: '1.1em',
              fontWeight: 'bold',
              marginBottom: '8px',
            }}>
              Error
            </p>
            <p style={{
              fontFamily: 'var(--font2)',
              color: 'var(--colour5)',
              fontSize: '0.9em',
              marginBottom: '24px',
            }}>
              {statusMessage}
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <Button
                type="basic"
                label="← Try Again"
                onClick={handleBackToPreview}
              />
              <Button
                type="basic"
                label="Start Over"
                onClick={handleReset}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default MediaManager;
