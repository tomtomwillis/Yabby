import type { FirestoreTimestamp } from '../types/firestore';

/** Render a Firestore timestamp as a locale string; empty string if missing/invalid. */
export function formatTimestamp(timestamp: FirestoreTimestamp | null | undefined): string {
  if (!timestamp) return '';
  try {
    return new Date(timestamp.seconds * 1000).toLocaleString();
  } catch {
    return '';
  }
}
