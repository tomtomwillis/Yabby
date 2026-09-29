import { auth } from '../firebaseConfig';

const MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL || '/api/media';

// One lookup per profile per page load, however many places show it.
const names = new Map<string, Promise<string | null>>();

/** A SteamID64 is a string of digits — nobody wants to read that. */
export const isSteamId64 = (handle: string) => /^7656119[0-9]{10}$/.test(handle);

/** The Steam profile name for a handle, or null when it cannot be found. */
export function steamPersonaName(handle: string): Promise<string | null> {
  let name = names.get(handle);
  if (!name) {
    name = lookup(handle).catch(() => {
      // Unlike "no such profile", a failure is worth retrying next time.
      names.delete(handle);
      return null;
    });
    names.set(handle, name);
  }
  return name;
}

async function lookup(handle: string): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const response = await fetch(`${MEDIA_API_URL}/steam/persona?id=${encodeURIComponent(handle)}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  return typeof data.name === 'string' ? data.name : null;
}
