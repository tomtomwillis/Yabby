import { useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { singleAvatarIcon } from './TravelPinIcon';
import { uploadTravelPhoto, getTravelPhotoUrl } from '../../utils/travelApi';
import type { NominatimResult } from '../../utils/nominatim';
import type { TravelPhoto } from './travelTypes';
import './TravelConfirmForm.css';

interface TravelConfirmFormProps {
  picked: NominatimResult;
  currentUserAvatar: string;
  onConfirm: (args: { comment: string; photos: TravelPhoto[] }) => Promise<void>;
  onCancel: () => void;
}

const MAX_PHOTOS = 8;

export default function TravelConfirmForm({
  picked,
  currentUserAvatar,
  onConfirm,
  onCancel,
}: TravelConfirmFormProps) {
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<TravelPhoto[]>([]);
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
      await onConfirm({ comment: trimmed, photos });
    } catch (err) {
      setError((err as Error).message || 'Could not save recommendation.');
      setSubmitting(false);
    }
  };

  const city = picked.display_name.split(',')[0];

  return (
    <div className="travel-confirm">
      <h3 className="travel-confirm__heading">Add: {city}</h3>
      <p className="travel-confirm__subheading">{picked.display_name}</p>

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
          <Marker position={[lat, lng]} icon={singleAvatarIcon(currentUserAvatar)} />
        </MapContainer>
      </div>

      <textarea
        className="travel-confirm__comment"
        placeholder="Why do you recommend this place?"
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
          {uploading ? 'Uploading…' : photos.length >= MAX_PHOTOS ? 'Photo limit reached' : 'Add photo'}
        </button>
        <button
          type="button"
          className="travel-confirm__btn travel-confirm__btn--primary"
          onClick={handleSubmit}
          disabled={submitting || uploading}
        >
          {submitting ? 'Saving…' : 'Confirm recommendation'}
        </button>
        <button type="button" className="travel-confirm__btn" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>

      {error && <p className="travel-confirm__error">{error}</p>}
    </div>
  );
}
