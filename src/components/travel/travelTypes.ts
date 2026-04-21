import type { Timestamp } from 'firebase/firestore';

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
