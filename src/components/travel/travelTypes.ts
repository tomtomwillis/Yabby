import type { Timestamp } from 'firebase/firestore';

export type PlaceCategory =
  | 'pub_bar'
  | 'club'
  | 'cafe'
  | 'restaurant'
  | 'poi'
  | 'gallery_museum'
  | 'other';

export const PLACE_CATEGORIES: { value: PlaceCategory; label: string }[] = [
  { value: 'pub_bar', label: 'Pub / Bar' },
  { value: 'club', label: 'Club' },
  { value: 'cafe', label: 'Café' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'poi', label: 'Point of Interest' },
  { value: 'gallery_museum', label: 'Gallery / Museum' },
  { value: 'other', label: 'Other' },
];

/** 10-colour palette — more slots than current categories to allow future additions */
export const CATEGORY_COLOURS: Record<PlaceCategory, string> = {
  pub_bar: '#f3722c',       // orange
  club: '#C44DFF',          // purple
  cafe: '#f94144',          // red
  restaurant: '#277da1',    // blue
  poi: '#43aa8b',           // mint
  gallery_museum: '#f9c74f', // yellow
  other: '#B0B0B0',         // grey
};

// Remaining palette slots (unused, reserved for future categories):
// '#FF4DDA' (hot pink), '#3DFF5C' (lime), '#FF9A3D' (amber)

export interface TravelPhoto {
  imageId: string;
  caption?: string;
}

export interface Place {
  id: string;
  displayName: string;
  lat: number;
  lng: number;
  city: string;
  cityKey: string;
  country: string;
  osmType: string;
  osmId: string;
  category: PlaceCategory;
  contributorCount: number;
  firstContributorUserId: string;
  firstContributorAvatar: string;
  firstContributorUsername: string;
  createdAt?: Timestamp | null;
  lastActivityAt?: Timestamp | null;
}

export interface Contribution {
  userId: string;
  username: string;
  avatar: string;
  comment: string;
  photos: TravelPhoto[];
  createdAt?: Timestamp | null;
  editedAt?: Timestamp | null;
}
