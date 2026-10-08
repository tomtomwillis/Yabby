import { collection, query, where, orderBy, limit, doc, documentId, startAfter } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { trackedGetDoc, trackedGetDocs } from './firestoreMetrics';
import {
  addDocShadowed,
  setDocShadowed,
  updateDocShadowed,
  deleteDocShadowed,
  SERVER_TIME,
  DELETE_FIELD,
  type WriteData,
} from '../api/shadow';
import {
  cityKey,
  compareEvents,
  isValidCityName,
  isValidEventImageId,
  toCalendarEvent,
  type CalendarEvent,
  type EventCategory,
  type EventStatus,
  type LineupAct,
} from '../components/events/eventTypes';

const EVENTS = 'events';
const CITIES = 'eventCities';
const MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL || '/api/media';

/*
 * Shared cache for everything that reads events — the calendar page, the home
 * widget and the hover card on bot posts. A range query also seeds the by-id
 * map, so hovering an event you have already seen in a list costs nothing.
 * Ranges expire after a few minutes so other members' additions show up; the
 * member's own writes are folded straight in.
 */
const RANGE_TTL = 5 * 60 * 1000;
const RANGE_MAX = 300;
const ranges = new Map<string, { at: number; events: Promise<CalendarEvent[]> }>();
const byId = new Map<string, CalendarEvent | null>();
const pendingById = new Map<string, Promise<CalendarEvent | null>>();

/** Every event dated between `start` and `end` inclusive, in calendar order. */
export function loadEventsInRange(start: string, end: string): Promise<CalendarEvent[]> {
  const key = `${start}|${end}`;
  const hit = ranges.get(key);
  if (hit && Date.now() - hit.at < RANGE_TTL) return hit.events;

  const events = trackedGetDocs(
    query(
      collection(db, EVENTS),
      where('date', '>=', start),
      where('date', '<=', end),
      orderBy('date'),
      limit(RANGE_MAX),
    ),
  ).then((snap) => {
    const list = snap.docs
      .map((d) => toCalendarEvent(d.id, d.data()))
      .filter((e): e is CalendarEvent => e !== null)
      .sort(compareEvents);
    for (const event of list) byId.set(event.id, event);
    return list;
  });

  ranges.set(key, { at: Date.now(), events });
  events.catch(() => ranges.delete(key));
  return events;
}

/** How many events one "show more" brings in. */
export const EVENT_PAGE_SIZE = 20;

/** Where a page of events ended — the next one starts after it. */
export interface EventCursor {
  date: string;
  id: string;
}

export interface EventPage {
  events: CalendarEvent[];
  /** Set when the page came back full, so there may be more after it. */
  next: EventCursor | null;
}

const pages = new Map<string, { at: number; page: Promise<EventPage> }>();

/**
 * Events dated `from` onwards, a page at a time, in date order — the calendar
 * list past the month it has already read. Each page picks up where the last
 * one stopped, so showing more never reads an event twice.
 */
export function loadEventsFrom(from: string, after: EventCursor | null = null): Promise<EventPage> {
  const key = `${from}|${after ? `${after.date}/${after.id}` : ''}`;
  const hit = pages.get(key);
  if (hit && Date.now() - hit.at < RANGE_TTL) return hit.page;

  const page = trackedGetDocs(
    query(
      collection(db, EVENTS),
      where('date', '>=', from),
      orderBy('date'),
      orderBy(documentId()),
      ...(after ? [startAfter(after.date, after.id)] : []),
      limit(EVENT_PAGE_SIZE),
    ),
  ).then((snap) => {
    const events = snap.docs
      .map((d) => toCalendarEvent(d.id, d.data()))
      .filter((e): e is CalendarEvent => e !== null);
    for (const event of events) byId.set(event.id, event);
    const last = snap.docs[snap.docs.length - 1];
    const next = snap.docs.length === EVENT_PAGE_SIZE && last ? { date: last.data().date as string, id: last.id } : null;
    return { events: events.sort(compareEvents), next };
  });

  pages.set(key, { at: Date.now(), page });
  page.catch(() => pages.delete(key));
  return page;
}

/** What the cache already knows about an event, without asking Firestore:
 *  the event, null if it is known to be gone, undefined if never seen. Lets a
 *  card that is opened on something already listed draw it on its first frame. */
export function peekEvent(id: string): CalendarEvent | null | undefined {
  return byId.get(id);
}

/** One event by id, or null when it does not exist (deleted, or never did). */
export function getEvent(id: string): Promise<CalendarEvent | null> {
  if (byId.has(id)) return Promise.resolve(byId.get(id) ?? null);
  const pending = pendingById.get(id);
  if (pending) return pending;

  const request = trackedGetDoc(doc(db, EVENTS, id))
    .then((snap) => {
      const event = snap.exists() ? toCalendarEvent(snap.id, snap.data()) : null;
      byId.set(id, event);
      return event;
    })
    .finally(() => pendingById.delete(id));
  pendingById.set(id, request);
  return request;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** What the form produces. Optional fields are omitted rather than empty. */
export interface EventDraft {
  title: string;
  date: string;
  category: EventCategory;
  time?: string;
  endTime?: string;
  timeZone?: string;
  description?: string;
  comment?: string;
  location?: string;
  city?: string;
  lineup?: LineupAct[];
  cost?: string;
  urls?: string[];
  imageId?: string;
  hosted: boolean;
}

const OPTIONAL_FIELDS = [
  'time', 'endTime', 'timeZone', 'description', 'comment', 'location', 'city', 'lineup', 'cost', 'urls', 'imageId',
] as const;

function present(draft: EventDraft): WriteData {
  const out: WriteData = { title: draft.title, date: draft.date, category: draft.category, hosted: draft.hosted };
  for (const key of OPTIONAL_FIELDS) {
    const value = draft[key];
    if (Array.isArray(value) ? value.length > 0 : value) out[key] = value;
  }
  // Firestore refuses an undefined field, so an act without a link carries no
  // artistId key at all.
  if (draft.lineup?.length) {
    out.lineup = draft.lineup.map((act) => (act.artistId ? { name: act.name, artistId: act.artistId } : { name: act.name }));
  }
  return out;
}

/** Folds a write into every cached range rather than dropping them, so the
 *  page re-reading its range after an edit costs nothing. */
function remember(event: CalendarEvent | null, id: string) {
  const before = byId.get(id);
  byId.set(id, event);
  // A page is cut at a cursor, so an event can only be swapped in where it
  // already sits. Anything that adds, removes or moves one starts them over.
  if (event && before && before.date === event.date) {
    for (const [key, entry] of pages) {
      const page = entry.page.then((p) => ({ ...p, events: p.events.map((e) => (e.id === id ? event : e)) }));
      pages.set(key, { at: entry.at, page });
    }
  } else {
    pages.clear();
  }
  for (const [key, entry] of ranges) {
    const [start, end] = key.split('|');
    const events = entry.events.then((list) => {
      const rest = list.filter((e) => e.id !== id);
      return event && event.date >= start && event.date <= end ? [...rest, event].sort(compareEvents) : rest;
    });
    ranges.set(key, { at: entry.at, events });
  }
}

export async function createEvent(draft: EventDraft, username: string): Promise<CalendarEvent> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You need to be signed in to add an event.');

  const ref = await addDocShadowed(collection(db, EVENTS), {
    ...present(draft),
    userId: uid,
    username,
    createdAt: SERVER_TIME,
  });
  const event: CalendarEvent = {
    ...draft,
    id: ref.id,
    userId: uid,
    username,
    interestedBy: [],
    interestCount: 0,
    goingBy: [],
    goingCount: 0,
  };
  remember(event, ref.id);
  await ensureEventCity(draft.city);
  return event;
}

/** Rewrites every editable field; one left empty in the draft is deleted. */
export async function updateEvent(existing: CalendarEvent, draft: EventDraft): Promise<CalendarEvent> {
  const kept = present(draft);
  const patch: WriteData = { ...kept, updatedAt: SERVER_TIME };
  // Deleting a field that was never there is a no-op, so no need to check.
  for (const key of OPTIONAL_FIELDS) {
    if (!(key in kept)) patch[key] = DELETE_FIELD;
  }
  await updateDocShadowed(doc(db, EVENTS, existing.id), patch);

  const event: CalendarEvent = {
    ...draft,
    id: existing.id,
    userId: existing.userId,
    username: existing.username,
    interestedBy: existing.interestedBy,
    interestCount: existing.interestCount,
    goingBy: existing.goingBy,
    goingCount: existing.goingCount,
  };
  remember(event, existing.id);
  await ensureEventCity(draft.city);
  return event;
}

export async function deleteEvent(id: string): Promise<void> {
  await deleteDocShadowed(doc(db, EVENTS, id));
  remember(null, id);
}

/** Folds a member's interested/going status into the cached copy of the
 *  event, so a re-read of the range shows the counts they just moved. */
export function rememberStatus(event: CalendarEvent, uid: string, status: EventStatus | null): CalendarEvent {
  const current = byId.get(event.id) ?? event;
  const move = (list: string[], count: number, on: boolean) => {
    const has = list.includes(uid);
    if (has === on) return { list, count };
    return { list: on ? [...list, uid] : list.filter((id) => id !== uid), count: Math.max(0, count + (on ? 1 : -1)) };
  };
  const interested = move(current.interestedBy, current.interestCount, status === 'interested');
  const going = move(current.goingBy, current.goingCount, status === 'going');
  const next: CalendarEvent = {
    ...current,
    interestedBy: interested.list,
    interestCount: interested.count,
    goingBy: going.list,
    goingCount: going.count,
  };
  remember(next, event.id);
  return next;
}

// ---------------------------------------------------------------------------
// Cities
//
// The list the form's city box offers. One small collection, read once a
// session; a city typed in that is not on it yet is added when the event is
// saved, so the next person finds it.
// ---------------------------------------------------------------------------

let citiesPromise: Promise<string[]> | null = null;

/** Every city anyone has added, sorted. */
export function loadEventCities(): Promise<string[]> {
  if (!citiesPromise) {
    citiesPromise = trackedGetDocs(collection(db, CITIES))
      .then((snap) =>
        snap.docs
          .map((d) => d.data().name)
          .filter((name): name is string => typeof name === 'string')
          .sort((a, b) => a.localeCompare(b)),
      )
      .catch((error) => {
        citiesPromise = null;
        throw error;
      });
  }
  return citiesPromise;
}

/** Adds a city to the list if it is new. Best effort: the event is already
 *  saved with its city, and a lost race means someone else just added it. */
async function ensureEventCity(name: string | undefined): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!name || !uid || !isValidCityName(name)) return;
  try {
    const known = await loadEventCities();
    if (known.some((city) => cityKey(city) === cityKey(name))) return;
    await setDocShadowed(doc(db, CITIES, cityKey(name)), { name, createdBy: uid, createdAt: SERVER_TIME });
    citiesPromise = Promise.resolve([...known, name].sort((a, b) => a.localeCompare(b)));
  } catch (error) {
    console.warn('Could not add the city to the list:', error);
  }
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

export async function authHeader(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return `Bearer ${await user.getIdToken(true)}`;
}

/** Stored beside message board images, through the same upload endpoint. */
export async function uploadEventImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('image', file);
  const response = await fetch(`${MEDIA_API_URL}/mb-images/upload`, {
    method: 'POST',
    headers: { Authorization: await authHeader() },
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Image upload failed.');
  if (typeof data.imageId !== 'string' || !isValidEventImageId(data.imageId)) {
    throw new Error('Image upload failed.');
  }
  return data.imageId;
}

/** Has the backend fetch an image from a pasted link and store it like an upload. */
export async function uploadEventImageFromUrl(url: string): Promise<string> {
  const response = await fetch(`${MEDIA_API_URL}/mb-images/from-url`, {
    method: 'POST',
    headers: { Authorization: await authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not fetch that image.');
  if (typeof data.imageId !== 'string' || !isValidEventImageId(data.imageId)) {
    throw new Error('Could not fetch that image.');
  }
  return data.imageId;
}

export function eventImageUrl(imageId: string | undefined): string | null {
  return imageId && isValidEventImageId(imageId) ? `${MEDIA_API_URL}/mb-images/${imageId}.webp` : null;
}

/** What an imported event page gives the form. */
export type ImportedEvent = Partial<Omit<EventDraft, 'hosted'>>;

/** Reads an event off a Communal Leisure, DICE or GEL link,
 *  through the backend — which asks each site at most once a day per page,
 *  and brings the poster across as an uploaded image. */
export async function importEventFromLink(url: string): Promise<ImportedEvent> {
  const response = await fetch(`${MEDIA_API_URL}/event-import?url=${encodeURIComponent(url)}`, {
    headers: { Authorization: await authHeader() },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.event || typeof data.event !== 'object') {
    throw new Error(data.error || 'Could not read that page.');
  }
  return data.event as ImportedEvent;
}

export type EventBotResult = { status: 'posted' | 'skipped'; count: number } | { status: 'exists' };

/** The boards the bot can post to. */
export const EVENT_BOT_BOARDS = ['messages', 'testMessages'];

/** Admins only — the backend checks. Posts this week's round-up now. */
export async function postEventBotNow(board: string): Promise<EventBotResult> {
  const response = await fetch(`${MEDIA_API_URL}/event-bot/post`, {
    method: 'POST',
    headers: { Authorization: await authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ board }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not post this week\'s events.');
  return data as EventBotResult;
}
