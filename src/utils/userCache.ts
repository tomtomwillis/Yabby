import type { User } from 'firebase/auth';
import { collection, doc, Timestamp, type DocumentData } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { trackedGetDoc, trackedGetDocs } from './firestoreMetrics';
import { updateDocShadowed, incrementBy } from '../api/shadow';
import { readSocials, type Socials } from './socials';

const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

/** The profile fields worth keeping — all of them come from the one users/{uid}
    read, so carrying bio and location costs nothing beyond what the username
    lookup already paid for. */
export interface UserProfile {
  username: string;
  /** False where the profile carries no name of its own and username above is
      standing in for one. Posts are rejected by the rules in that state, since
      the name on the post would not be the name on the profile. */
  hasUsername: boolean;
  avatar: string;
  bio: string;
  siteUrl: string;
  locationFlag: string;
  locationText: string;
  socials: Socials;
  /** The account's creation time in Firebase Auth. Null for anyone with no
      profile document to carry it, and for bots, which were never created. */
  joinedAt: Date | null;
  postCount: number;
  stickerCount: number;
  nekoEnabled: boolean;
  designToolEnabled: boolean;
}

const EMPTY: UserProfile = {
  username: 'Anonymous',
  hasUsername: false,
  avatar: '',
  bio: '',
  siteUrl: '',
  locationFlag: '',
  locationText: '',
  socials: {},
  joinedAt: null,
  postCount: 0,
  stickerCount: 0,
  nekoEnabled: false,
  designToolEnabled: false,
};

function toProfile(data: DocumentData): UserProfile {
  return {
    username: data.username || 'Anonymous',
    hasUsername: typeof data.username === 'string' && data.username.trim().length > 0,
    avatar: data.avatar || '',
    bio: data.bio || '',
    siteUrl: data.siteUrl || '',
    locationFlag: data.locationFlag || '',
    locationText: data.locationText || '',
    socials: readSocials(data.socials),
    joinedAt: data.joinedAt?.toDate?.() ?? null,
    postCount: typeof data.postCount === 'number' ? data.postCount : 0,
    stickerCount: typeof data.stickerCount === 'number' ? data.stickerCount : 0,
    nekoEnabled: data.nekoEnabled === true,
    designToolEnabled: data.designToolEnabled === true,
  };
}

type CacheEntry = UserProfile & { timestamp: number };

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<UserProfile>>();

const STORAGE_KEY = 'yabbyville.userCache.v3';
const FLUSH_DELAY = 200;

/* Session storage rather than local: a profile that outlived the browser could
   show a stale username for days, where a tab's lifetime is a natural ceiling
   on how wrong it can get. CACHE_DURATION still applies on top, so the worst
   case is unchanged — this only stops a refresh re-reading every author on the
   page from Firestore.

   joinedAt is a Date, so it survives the round trip as an ISO string and is
   revived on the way back in. */
function hydrate(): void {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as Record<string, Omit<CacheEntry, 'joinedAt'> & { joinedAt: string | null }>;
    const now = Date.now();
    for (const [userId, entry] of Object.entries(stored)) {
      if (!entry || typeof entry.timestamp !== 'number') continue;
      if (now - entry.timestamp >= CACHE_DURATION) continue;
      cache.set(userId, { ...entry, joinedAt: entry.joinedAt ? new Date(entry.joinedAt) : null });
    }
  } catch {
    // Storage unavailable (private browsing), or a shape an older build wrote.
    // Either way the cache starts empty and refills itself.
  }
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  flushTimer = null;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch {
    // Out of quota or no storage at all. Drop whatever is there rather than
    // leave a half-written entry behind; the in-memory cache is unaffected.
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing further to try.
    }
  }
}

/* Coalesced, because a board page resolves one profile per author and each
   would otherwise be its own synchronous write. Flushed on pagehide too — a
   refresh landing inside the debounce window is exactly the case this exists
   to serve. */
function persist(): void {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flush, FLUSH_DELAY);
}

if (typeof window !== 'undefined') {
  hydrate();
  window.addEventListener('pagehide', () => {
    if (flushTimer !== null) clearTimeout(flushTimer);
    flush();
  });
}

/** Clear a specific user from the cache (e.g. after profile update) */
export function clearUserCache(userId: string): void {
  cache.delete(userId);
  persist();
}

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const now = Date.now();
  const cached = cache.get(userId);

  if (cached && now - cached.timestamp < CACHE_DURATION) {
    const { timestamp: _t, ...profile } = cached;
    return profile;
  }

  // Deduplicate concurrent fetches for the same userId
  const pending = inFlight.get(userId);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const userDoc = await trackedGetDoc(doc(db, 'users', userId));
      const userData = userDoc.exists() ? toProfile(userDoc.data()) : EMPTY;

      cache.set(userId, { ...userData, timestamp: Date.now() });
      persist();
      return userData;
    } catch {
      cache.set(userId, { ...EMPTY, timestamp: Date.now() });
      persist();
      return EMPTY;
    } finally {
      inFlight.delete(userId);
    }
  })();

  inFlight.set(userId, promise);
  return promise;
}

export type DirectoryEntry = UserProfile & { userId: string };

let directory: { entries: Promise<DirectoryEntry[]>; timestamp: number } | null = null;

/** Every member with a name of their own, alphabetised. One read per member, so
    it is held for as long as a single profile is, and each result primes the
    per-user cache — anyone opening a profile or hovering a name from the
    directory costs nothing further. */
export function getAllUserProfiles(): Promise<DirectoryEntry[]> {
  if (directory && Date.now() - directory.timestamp < CACHE_DURATION) {
    return directory.entries;
  }

  const entries = trackedGetDocs(collection(db, 'users')).then((snap) => {
    const now = Date.now();
    const list: DirectoryEntry[] = [];
    snap.forEach((userDoc) => {
      const profile = toProfile(userDoc.data());
      cache.set(userDoc.id, { ...profile, timestamp: now });
      if (profile.hasUsername) list.push({ ...profile, userId: userDoc.id });
    });
    persist();
    return list.sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: 'base' }));
  });

  directory = { entries, timestamp: Date.now() };
  entries.catch(() => {
    directory = null;
  });
  return entries;
}

export async function getUserData(
  userId: string,
): Promise<{ username: string; avatar: string; hasUsername: boolean }> {
  const { username, avatar, hasUsername } = await getUserProfile(userId);
  return { username, avatar, hasUsername };
}

/** Copies the account's Auth creation time onto the profile the first time
    someone signs in without one. Goes through the same cached profile read the
    board already does, so on a normal session it costs no extra reads; the
    write only ever happens once per account.
    Silent on failure: anyone who has not saved a profile has no users document
    to update, and the rules require a valid username on every write to one. */
export async function ensureJoinedAt(user: User): Promise<void> {
  const profile = await getUserProfile(user.uid);
  if (profile.joinedAt) return;

  const creationTime = user.metadata.creationTime;
  if (!creationTime) return;

  try {
    await updateDocShadowed(doc(db, 'users', user.uid), {
      joinedAt: Timestamp.fromDate(new Date(creationTime)),
    });
    clearUserCache(user.uid);
  } catch {
    // No profile document yet, or the write was rejected — either way there is
    // nothing to show in the gutter and nothing to retry.
  }
}

/** Advances the poster's tally by one. Fire-and-forget: a post that succeeded
    should not be reported as failed because its counter did not move. */
export async function bumpPostCount(userId: string): Promise<void> {
  try {
    await updateDocShadowed(doc(db, 'users', userId), { postCount: incrementBy(1) });
    clearUserCache(userId);
  } catch (error) {
    console.error('Failed to update post count:', error);
  }
}

/** Moves a member's sticker tally by one as a sticker is placed or deleted.
    Fire-and-forget, like bumpPostCount. The rules also let an admin take one
    off when deleting someone else's sticker. */
export async function bumpStickerCount(userId: string, delta: 1 | -1): Promise<void> {
  try {
    await updateDocShadowed(doc(db, 'users', userId), { stickerCount: incrementBy(delta) });
    clearUserCache(userId);
  } catch (error) {
    console.error('Failed to update sticker count:', error);
  }
}

/** Admin only: sets every member's stickerCount from the stickers that exist.
    One read per sticker and per profile, so this is a repair tool for /test,
    not something to run on a page load. Writes only the counts that are wrong,
    and returns how many that was. */
export async function recountStickers(): Promise<{ stickers: number; changed: number }> {
  const [stickerSnap, userSnap] = await Promise.all([
    trackedGetDocs(collection(db, 'stickers')),
    trackedGetDocs(collection(db, 'users')),
  ]);

  const counts = new Map<string, number>();
  stickerSnap.forEach((sticker) => {
    const userId = sticker.data().userId;
    if (typeof userId === 'string') counts.set(userId, (counts.get(userId) ?? 0) + 1);
  });

  let changed = 0;
  for (const userDoc of userSnap.docs) {
    const actual = counts.get(userDoc.id) ?? 0;
    const stored = userDoc.data().stickerCount;
    if (stored === actual || (stored === undefined && actual === 0)) continue;
    await updateDocShadowed(userDoc.ref, { stickerCount: actual });
    cache.delete(userDoc.id);
    changed += 1;
  }

  directory = null;
  persist();
  return { stickers: stickerSnap.size, changed };
}
