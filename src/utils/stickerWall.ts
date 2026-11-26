import { recentStickers } from '../api/areas/stickers';
import type { FirestoreTimestamp } from '../types/firestore';

const CACHE_DURATION = 5 * 60 * 1000;

export interface WallSticker {
  userId: string;
  albumId: string;
  albumName?: string;
  albumArtist?: string;
  text: string;
  position: { x: number; y: number };
  sticker: string;
  timestamp: FirestoreTimestamp | null;
  favoriteTrackId?: string;
  favoriteTrackTitle?: string;
}

let wall: { stickers: Promise<WallSticker[]>; timestamp: number } | null = null;

/** Every sticker, newest first, through the stickers area (the API, or
    Firestore when the flag says so). The largest read on the site, so it is
    held for five minutes and shared by anyone asking at once. A failed read is
    not kept. */
export function getAllStickers(): Promise<WallSticker[]> {
  if (wall && Date.now() - wall.timestamp < CACHE_DURATION) return wall.stickers;

  const entry = {
    stickers: recentStickers().then((docs) => docs.map((doc) => doc.data as unknown as WallSticker)),
    timestamp: Date.now(),
  };
  const forget = () => {
    if (wall === entry) wall = null;
  };

  wall = entry;
  entry.stickers.catch(forget);
  return entry.stickers;
}

/** Call after adding or deleting a sticker, so the next visit reads it back. */
export function clearStickerWall(): void {
  wall = null;
}
