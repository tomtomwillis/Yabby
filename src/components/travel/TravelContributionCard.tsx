import { createPortal } from 'react-dom';
import { useRef, useState } from 'react';
import { sanitizeHtml } from '../../utils/sanitise';
import { uploadTravelPhoto, getTravelPhotoUrl } from '../../utils/travelApi';
import type { Contribution, PlaceCategory, TravelPhoto } from './travelTypes';
import { PLACE_CATEGORIES } from './travelTypes';
import './TravelContributionCard.css';

interface TravelContributionCardProps {
  contribution: Contribution;
  isOwn: boolean;
  category: PlaceCategory;
  onSaveEdit: (next: { comment: string; photos: TravelPhoto[]; category: PlaceCategory }) => Promise<void>;
  onDelete: () => Promise<void>;
}

const MAX_PHOTOS = 8;

export default function TravelContributionCard({
  contribution,
  isOwn,
  category: initialCategory,
  onSaveEdit,
  onDelete,
}: TravelContributionCardProps) {
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(contribution.comment);
  const [photos, setPhotos] = useState<TravelPhoto[]>(contribution.photos);
  const [category, setCategory] = useState<PlaceCategory>(initialCategory);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const startEdit = () => {
    setComment(contribution.comment);
    setPhotos(contribution.photos);
    setCategory(initialCategory);
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError(null);
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, MAX_PHOTOS - photos.length);
    setError(null);
    setUploading(true);
    try {
      const added: TravelPhoto[] = [];
      for (const file of files) {
        const imageId = await uploadTravelPhoto(file);
        added.push({ imageId });
      }
      setPhotos((prev) => [...prev, ...added]);
    } catch (err) {
      setError((err as Error).message || 'Photo upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removePhoto = (imageId: string) => {
    setPhotos((prev) => prev.filter((p) => p.imageId !== imageId));
  };

  const handleSave = async () => {
    const trimmed = comment.trim();
    if (!trimmed && photos.length === 0) {
      setError('Add a comment or at least one photo.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSaveEdit({ comment: trimmed, photos, category });
      setEditing(false);
    } catch (err) {
      setError((err as Error).message || 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this recommendation? This cannot be undone.')) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete();
    } catch (err) {
      setError((err as Error).message || 'Could not delete.');
      setBusy(false);
    }
  };

  return (
    <div className="travel-card">
      <div className="travel-card__header">
        {contribution.avatar ? (
          <img className="travel-card__avatar" src={contribution.avatar} alt="" />
        ) : (
          <div className="travel-card__avatar" />
        )}
        <span className="travel-card__username">{contribution.username}</span>
        {contribution.editedAt && <span className="travel-card__edit-indicator">(edited)</span>}
      </div>
      <hr className="travel-card__divider" />

      {editing ? (
        <>
          <label className="travel-card__category-label">
            <span className="travel-card__category-hint">Category</span>
            <select
              className="travel-card__category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as PlaceCategory)}
            >
              {PLACE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <textarea
            className="travel-card__edit-area"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={10000}
          />
          {photos.length > 0 && (
            <div className="travel-card__photos travel-card__photos--editing">
              {photos.map((p) => (
                <div key={p.imageId} className="travel-card__photo">
                  <img src={getTravelPhotoUrl(p.imageId)} alt="" />
                  <button
                    type="button"
                    className="travel-card__photo-remove"
                    onClick={() => removePhoto(p.imageId)}
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="travel-card__hidden-file"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />
          <div className="travel-card__actions">
            <button
              type="button"
              className="travel-card__btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || photos.length >= MAX_PHOTOS || busy}
            >
              {uploading ? 'Uploading…' : 'Add photo'}
            </button>
            <button
              type="button"
              className="travel-card__btn travel-card__btn--primary"
              onClick={handleSave}
              disabled={busy || uploading}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="travel-card__btn" onClick={cancelEdit} disabled={busy}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="travel-card__body">
            {contribution.comment && (
              <p
                className="travel-card__comment"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(contribution.comment) }}
              />
            )}
            {contribution.photos.length > 0 && (
              <div className="travel-card__photos">
                {contribution.photos.map((p) => {
                  const url = getTravelPhotoUrl(p.imageId);
                  return (
                    <div
                      key={p.imageId}
                      className="travel-card__photo"
                      onClick={() => setLightboxUrl(url)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && setLightboxUrl(url)}
                      aria-label="View photo"
                    >
                      <img src={url} alt="" loading="lazy" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {isOwn && (
            <div className="travel-card__actions">
              <button type="button" className="travel-card__btn" onClick={startEdit} disabled={busy}>
                Edit
              </button>
              <button
                type="button"
                className="travel-card__btn travel-card__btn--danger"
                onClick={handleDelete}
                disabled={busy}
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          )}
        </>
      )}

      {error && <p className="travel-card__error">{error}</p>}

      {lightboxUrl && createPortal(
        <div
          className="travel-card__lightbox"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="travel-card__lightbox-close"
            onClick={() => setLightboxUrl(null)}
            aria-label="Close"
          >
            ×
          </button>
          <img src={lightboxUrl} alt="" onClick={(e) => e.stopPropagation()} />
        </div>,
        document.body,
      )}
    </div>
  );
}
