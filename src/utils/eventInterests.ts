import { useEffect, useSyncExternalStore } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { doc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { trackedGetDoc } from './firestoreMetrics';
import {
  setDocShadowed,
  updateDocShadowed,
  arrayUnionOf,
  arrayRemoveOf,
  incrementBy,
  SERVER_TIME,
} from '../api/shadow';
import { authHeader, peekEvent, rememberStatus } from './eventsApi';
import { clearUserCache } from './userCache';
import { statusFrom, type CalendarEvent, type EventStatus } from '../components/events/eventTypes';

/*
 * The events the signed-in member has ticked "interested?" or "going" on — one
 * private document, eventInterests/{uid}, read once a session and shared by
 * every component that shows a tick or a marker. eventIds holds both, and is
 * what the calendar feed reads; goingIds is the going subset. Ticks update
 * here at once and are written behind, one at a time and in order. Each is
 * also counted on the event itself (interestedBy/goingBy and their counts),
 * which is what other members see.
 *
 * The same document carries feedVersion, which the backend signs into the
 * member's calendar feed link. Raising it retires the old link.
 */

const INTERESTS = 'eventInterests';
const EVENTS = 'events';
const MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL || '/api/media';

/** The rules' cap. Past it the oldest ticks give way to the new one. */
export const MAX_INTERESTS = 200;

interface Interests {
  uid: string;
  /** In the order they were ticked, oldest first. */
  ids: ReadonlySet<string>;
  /** The ones the member has a ticket for — always also in `ids`. */
  going: ReadonlySet<string>;
  exists: boolean;
  feedVersion: number;
}

const NONE: ReadonlySet<string> = new Set();

let current: Interests | null = null;
let pending: { uid: string; promise: Promise<Interests> } | null = null;
let writes: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function publish(next: Interests) {
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function loadInterests(uid: string, fresh = false): Promise<Interests> {
  if (!fresh && current?.uid === uid) return Promise.resolve(current);
  if (!fresh && pending?.uid === uid) return pending.promise;

  const promise = trackedGetDoc(doc(db, INTERESTS, uid))
    .then((snap) => {
      const data = snap.data() ?? {};
      const strings = (value: unknown) =>
        Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
      const ids = new Set(strings(data.eventIds));
      const going = new Set(strings(data.goingIds).filter((id) => ids.has(id)));
      const feedVersion = Number.isInteger(data.feedVersion) && data.feedVersion >= 1 ? data.feedVersion : 1;
      const loaded: Interests = { uid, ids, going, exists: snap.exists(), feedVersion };
      publish(loaded);
      return loaded;
    })
    .finally(() => {
      if (pending?.promise === promise) pending = null;
    });
  pending = { uid, promise };
  return promise;
}

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to use your calendar.');
  return uid;
}

/** Runs writes one after another, so a tick and an untick in quick
 *  succession reach Firestore in the order they were made. */
function enqueue<T>(write: () => Promise<T>): Promise<T> {
  const run = writes.then(write, write);
  writes = run.catch(() => {});
  return run;
}

/** The member's ticks, for drawing: `ids` is everything in their calendar,
 *  `going` the ones they have a ticket for. Empty until loaded, and when
 *  signed out. */
export function useEventInterests(): { ids: ReadonlySet<string>; going: ReadonlySet<string>; ready: boolean } {
  const [user] = useAuthState(auth);
  const uid = user?.uid ?? null;
  const snapshot = useSyncExternalStore(subscribe, () => current);

  useEffect(() => {
    if (uid) loadInterests(uid).catch((error) => console.warn('Could not load your calendar:', error));
  }, [uid]);

  const mine = uid && snapshot?.uid === uid ? snapshot : null;
  return { ids: mine?.ids ?? NONE, going: mine?.going ?? NONE, ready: mine !== null };
}

/** Marks the member interested in or going to an event, or neither. The two
 *  exclude each other, so choosing one clears the other. */
export async function setEventStatus(event: CalendarEvent, status: EventStatus | null): Promise<void> {
  const eventId = event.id;
  const uid = requireUid();
  const state = await loadInterests(uid);
  const before = statusFrom(eventId, state.ids, state.going);

  if (before !== status) {
    const next = new Set(state.ids);
    const nextGoing = new Set(state.going);
    if (status) next.add(eventId);
    else next.delete(eventId);
    if (status === 'going') nextGoing.add(eventId);
    else nextGoing.delete(eventId);
    const overflow = next.size > MAX_INTERESTS;
    const ids = overflow ? new Set([...next].slice(-MAX_INTERESTS)) : next;
    const going = overflow ? new Set([...nextGoing].filter((id) => ids.has(id))) : nextGoing;
    const create = !state.exists;
    publish({ ...state, ids, going, exists: true });

    const ref = doc(db, INTERESTS, uid);
    try {
      await enqueue(() => {
        if (create) {
          return setDocShadowed(ref, {
            eventIds: [...ids],
            goingIds: [...going],
            feedVersion: state.feedVersion,
            updatedAt: SERVER_TIME,
          });
        }
        // The whole lists only when trimming; otherwise transforms, so two
        // tabs ticking at once do not overwrite each other.
        if (overflow) return updateDocShadowed(ref, { eventIds: [...ids], goingIds: [...going], updatedAt: SERVER_TIME });
        return updateDocShadowed(ref, {
          eventIds: status ? arrayUnionOf(eventId) : arrayRemoveOf(eventId),
          goingIds: status === 'going' ? arrayUnionOf(eventId) : arrayRemoveOf(eventId),
          updatedAt: SERVER_TIME,
        });
      });
    } catch (error) {
      // What is stored is no longer certain, so read it back rather than guess.
      await loadInterests(uid, true).catch(() => {});
      throw error;
    }
  }

  // The public counts follow. They go by what the event says rather than the
  // private list, so a tick made before counts existed is never counted off.
  const latest = peekEvent(eventId) ?? event;
  const patch: Record<string, unknown> = {};
  const step = (list: string[], listKey: string, countKey: string, on: boolean) => {
    if (list.includes(uid) === on) return;
    patch[listKey] = on ? arrayUnionOf(uid) : arrayRemoveOf(uid);
    patch[countKey] = incrementBy(on ? 1 : -1);
  };
  step(latest.interestedBy, 'interestedBy', 'interestCount', status === 'interested');
  step(latest.goingBy, 'goingBy', 'goingCount', status === 'going');
  if (Object.keys(patch).length === 0) return;

  rememberStatus(latest, uid, status);
  try {
    await enqueue(() => updateDocShadowed(doc(db, EVENTS, eventId), patch));
  } catch (error) {
    // The member's own calendar has it either way; only the counts are off.
    restoreStatus(latest, uid);
    console.warn('Could not update the interest count:', error);
  }
}

/** Puts the member's status back to what the event said before a failed
 *  count write. */
function restoreStatus(before: CalendarEvent, uid: string) {
  rememberStatus(
    before,
    uid,
    before.goingBy.includes(uid) ? 'going' : before.interestedBy.includes(uid) ? 'interested' : null,
  );
}

/**
 * Who else may see the member's ticks: `calendarPublic` puts them in the
 * calendar's "calendar:" filter for everyone, and `calendarFeedPublic` shows
 * their feed link on their profile. Both live on the profile, where anyone
 * looking at the member already reads.
 */
export async function setCalendarSharing(patch: { calendarPublic?: boolean; calendarFeedPublic?: boolean }): Promise<void> {
  const uid = requireUid();
  await updateDocShadowed(doc(db, 'users', uid), patch);
  clearUserCache(uid);
}

/** Another member's feed address, when they show it on their profile. */
export async function getPublicFeedLink(uid: string): Promise<string> {
  const response = await fetch(`${MEDIA_API_URL}/calendar/link/${encodeURIComponent(uid)}`, {
    headers: { Authorization: await authHeader() },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.token !== 'string' || !TOKEN_RE.test(data.token)) {
    throw new Error(data.error || 'Could not get that calendar link.');
  }
  return new URL(`${MEDIA_API_URL}/calendar/feed/${data.token}.ics`, window.location.origin).href;
}

// ---------------------------------------------------------------------------
// The calendar feed link
// ---------------------------------------------------------------------------

const TOKEN_RE = /^[A-Za-z0-9]+\.[0-9]+\.[A-Za-z0-9_-]+$/;
const links = new Map<string, Promise<string>>();

async function fetchFeedLink(): Promise<string> {
  const response = await fetch(`${MEDIA_API_URL}/calendar/link`, { headers: { Authorization: await authHeader() } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not get your calendar link.');
  if (typeof data.token !== 'string' || !TOKEN_RE.test(data.token)) throw new Error('Could not get your calendar link.');
  return new URL(`${MEDIA_API_URL}/calendar/feed/${data.token}.ics`, window.location.origin).href;
}

/** The member's own feed address, asked of the backend once a session. */
export function getFeedLink(): Promise<string> {
  const uid = requireUid();
  let link = links.get(uid);
  if (!link) {
    link = fetchFeedLink();
    links.set(uid, link);
    link.catch(() => links.delete(uid));
  }
  return link;
}

/** Retires the current link and resolves with the new one. */
export async function resetFeedLink(): Promise<string> {
  const uid = requireUid();
  await loadInterests(uid);
  const ref = doc(db, INTERESTS, uid);

  await enqueue(async () => {
    const state = current?.uid === uid ? current : await loadInterests(uid);
    if (state.exists) {
      await updateDocShadowed(ref, { feedVersion: incrementBy(1), updatedAt: SERVER_TIME });
    } else {
      await setDocShadowed(ref, { eventIds: [...state.ids], feedVersion: state.feedVersion + 1, updatedAt: SERVER_TIME });
    }
    const latest = current?.uid === uid ? current : state;
    publish({ ...latest, exists: true, feedVersion: state.feedVersion + 1 });
  });

  links.delete(uid);
  return getFeedLink();
}

/** The same address for apps that subscribe on a webcal:// link — Apple
 *  Calendar and Outlook offer to subscribe straight away. */
export function webcalLink(url: string): string {
  return url.replace(/^https?:/, 'webcal:');
}

/** Google Calendar's own "add by URL" page, pre-filled. */
export function googleCalendarLink(url: string): string {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcalLink(url))}`;
}
