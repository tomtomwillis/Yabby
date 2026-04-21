import { auth } from '../firebaseConfig';
import type { TravelPhoto } from '../components/travel/travelTypes';

const MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL || '/api/media';
const TRAVEL_API_URL = import.meta.env.VITE_TRAVEL_API_URL || '/api/travel';

async function authHeader(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const token = await user.getIdToken(true);
  return `Bearer ${token}`;
}

export async function uploadTravelPhoto(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${MEDIA_API_URL}/travel-photos/upload`, {
    method: 'POST',
    headers: { Authorization: await authHeader() },
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Photo upload failed');
  }

  const data = await response.json();
  return data.imageId as string;
}

export function getTravelPhotoUrl(imageId: string): string {
  return `${MEDIA_API_URL}/travel-photos/${imageId}.webp`;
}

export interface SaveContributionPayload {
  placeId: string;
  displayName: string;
  lat: number;
  lng: number;
  city: string;
  country: string;
  osmType: string;
  osmId: string;
  comment: string;
  photos: TravelPhoto[];
}

export async function saveTravelContribution(payload: SaveContributionPayload): Promise<void> {
  const response = await fetch(`${TRAVEL_API_URL}/contributions`, {
    method: 'POST',
    headers: {
      Authorization: await authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Could not save recommendation.');
  }
}

export async function deleteTravelContribution(placeId: string): Promise<void> {
  const response = await fetch(
    `${TRAVEL_API_URL}/contributions/${encodeURIComponent(placeId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: await authHeader() },
    },
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Could not delete recommendation.');
  }
}
