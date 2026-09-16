import { useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { singleAvatarIcon } from './TravelPinIcon';
import { uploadTravelPhoto, getTravelPhotoUrl } from '../../utils/travelApi';
import type { PlaceSearchResult } from '../../utils/geocode';
import type { PlaceCategory, TravelPhoto } from './travelTypes';
import { PLACE_CATEGORIES } from './travelTypes';
import './TravelConfirmForm.css';

interface TravelConfirmFormProps {
  picked: PlaceSearchResult;
  currentUserAvatar: string;
  suggestedCategory: PlaceCategory;
  onConfirm: (args: { comment: string; photos: TravelPhoto[]; category: PlaceCategory }) => Promise<void>;
  onCancel: () => void;
}

const MAX_PHOTOS = 8;

export default function TravelConfirmForm({
  picked,
  currentUserAvatar,
  suggestedCategory,
  onConfirm,
  onCancel,
}: TravelConfirmFormProps) {
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<TravelPhoto[]>([]);
  const [category, setCategory] = useState<PlaceCategory>(suggestedCategory);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const lat = parseFloat(picked.lat);
  const lng = parseFloat(picked.lon);

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).slice(0, MAX_PHOTOS - photos.length);
    setError(null);
    setUploading(true);
    try {
      const uploaded: TravelPhoto[] = [];
      for (const file of files) {
        const imageId = await uploadTravelPhoto(file);
        uploaded.push({ imageId });
      }
      setPhotos((prev) => [...prev, ...uploaded]);
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

  const handleSubmit = async () => {
    const trimmed = comment.trim();
    if (!trimmed && photos.length === 0) {
      setError('Add a comment or at least one photo.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm({ comment: trimmed, photos, category });
    } catch (err) {
      setError((err as Error).message || 'Could not save recommendation.');
      setSubmitting(false);
    }
  };

  const shortName = picked.display_name.split(',')[0];

  return (
    <div className="travel-confirm">
      <div className="travel-confirm__head">
        <span className="travel-confirm__head-label">new recommendation</span>
        <span className="travel-confirm__head-rule" aria-hidden="true" />
        <button
          type="button"
          className="travel-confirm__head-cancel"
          onClick={onCancel}
          disabled={submitting}
        >
          cancel
        </button>
      </div>

      <div className="travel-confirm__grid">
        <div className="travel-confirm__side">
          <div className="travel-confirm__mini-map">
            <MapContainer
              center={[lat, lng]}
              zoom={13}
              scrollWheelZoom={false}
              dragging={false}
              doubleClickZoom={false}
              touchZoom={false}
              boxZoom={false}
              zoomControl={false}
              attributionControl={false}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={[lat, lng]} icon={singleAvatarIcon(currentUserAvatar, category)} />
            </MapContainer>
          </div>
          <p className="travel-confirm__name">{shortName}</p>
          <p className="travel-confirm__addr">{picked.display_name}</p>
        </div>

        <div className="travel-confirm__body">
          {/* The same run of word-controls the filter uses, so the one place
              that sets a category reads like the one that reads it. */}
          <div className="travel-confirm__field">
            <span className="travel-confirm__field-label">category</span>
            <div className="travel-confirm__cats" role="group" aria-label="Category">
              {PLACE_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`travel-confirm__cat${category === c.value ? ' is-sel' : ''}`}
                  aria-pressed={category === c.value}
                  onClick={() => setCategory(c.value)}
                >
                  {c.label.toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <textarea
            className="travel-confirm__comment"
            placeholder="why do you recommend this place?"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={10000}
          />

          {photos.length > 0 && (
            <div className="travel-confirm__photos">
              {photos.map((p) => (
                <div key={p.imageId} className="travel-confirm__photo-thumb">
                  <img src={getTravelPhotoUrl(p.imageId)} alt="" />
                  <button
                    type="button"
                    className="travel-confirm__photo-remove"
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
            className="travel-confirm__hidden-file"
            onChange={(e) => handleFilesSelected(e.target.files)}
          />

          <div className="travel-confirm__actions">
            <button
              type="button"
              className="travel-confirm__btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || photos.length >= MAX_PHOTOS}
            >
              {uploading ? 'uploading…' : photos.length >= MAX_PHOTOS ? 'photo limit reached' : 'add photo'}
            </button>
            {/* The page's one filled control. */}
            <button
              type="button"
              className="travel-confirm__btn travel-confirm__btn--primary"
              onClick={handleSubmit}
              disabled={submitting || uploading}
            >
              {submitting ? 'saving…' : 'confirm'}
            </button>
          </div>

          {error && <p className="travel-confirm__error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
