import { authedJson, MEDIA_API_URL } from '../api/media';
import type { PlaceCategory, TravelPhoto } from '../components/travel/travelTypes';

export { uploadTravelPhoto } from '../api/media';

const TRAVEL_API_URL = import.meta.env.VITE_TRAVEL_API_URL || '/api/travel';

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
  category: PlaceCategory;
  comment: string;
  photos: TravelPhoto[];
}

export async function saveTravelContribution(payload: SaveContributionPayload): Promise<void> {
  await authedJson(`${TRAVEL_API_URL}/contributions`, 'Could not save recommendation.', {
    method: 'POST',
    json: payload,
  });
}

export async function deleteTravelContribution(placeId: string): Promise<void> {
  await authedJson(`${TRAVEL_API_URL}/contributions/${encodeURIComponent(placeId)}`, 'Could not delete recommendation.', {
    method: 'DELETE',
  });
}
