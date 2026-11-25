import { collection, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { trackedGetDocs } from '../../../utils/firestoreMetrics';
import { fetchSubsonicXml } from '../../../utils/navidrome';
import { publicLists } from '../../../api/areas/lists';
import { listPlaces } from '../../../api/areas/travel';
import { getAllUserProfiles } from '../../../utils/userCache';
import { loadEventsInRange } from '../../../utils/eventsApi';
import { dayLabel } from '../../events/eventTypes';

/*
 * What the / commands search, loaded the first time a command needs it and
 * shared by every text box on the page, so a reply box opening /list after
 * the main composer did costs nothing. Kept a few minutes so things added
 * meanwhile show up.
 */

const TTL = 5 * 60 * 1000;

function shared<T>(load: () => Promise<T>): () => Promise<T> {
  let at = 0;
  let pending: Promise<T> | null = null;
  return () => {
    if (pending && Date.now() - at < TTL) return pending;
    at = Date.now();
    const p = load();
    pending = p;
    p.catch(() => {
      if (pending === p) pending = null;
    });
    return p;
  };
}

export interface Named {
  id: string;
  name: string;
}

export interface Place {
  id: string;
  name: string;
  city: string;
  cityKey: string;
}

export interface TagEvent {
  id: string;
  title: string;
  date: string;
  /** Title, city, venue and lineup, lower-cased. */
  search: string;
}

// getAllUserProfiles keeps its own cache, shared with the directory.
export const loadMembers = (): Promise<Named[]> =>
  getAllUserProfiles().then((entries) => entries.map((u) => ({ id: u.userId, name: u.username })));

export const loadLists = shared(async (): Promise<Named[]> => {
  const lists: Named[] = [];
  for (const { id, data } of await publicLists()) {
    if (data.title) lists.push({ id, name: String(data.title) });
  }
  return lists.sort((a, b) => a.name.localeCompare(b.name));
});

export const loadPlaces = shared(async (): Promise<Place[]> => {
  const places: Place[] = [];
  for (const { id, data } of await listPlaces()) {
    if (data.displayName) {
      places.push({ id, name: String(data.displayName), city: String(data.city || ''), cityKey: String(data.cityKey || '') });
    }
  }
  return places;
});

export const loadPlaylists = shared(async (): Promise<Named[]> => {
  const xml = await fetchSubsonicXml('getPlaylists');
  return Array.from(xml.getElementsByTagName('playlist')).map((el) => ({
    id: el.getAttribute('id') || '',
    name: el.getAttribute('name') || 'Unknown Playlist',
  }));
});

export const loadIssues = shared(async (): Promise<Named[]> => {
  const snapshot = await trackedGetDocs(query(collection(db, 'issues'), orderBy('lastActivityAt', 'desc'), limit(50)));
  return snapshot.docs.map((docSnap) => {
    // Issues have no title — a snippet of the report stands in.
    const plain = String(docSnap.data().text || '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const name = plain ? (plain.length > 60 ? `${plain.slice(0, 60)}…` : plain) : '(image post)';
    return { id: docSnap.id, name };
  });
});

/** Events dated `start`..`end`, in date order. eventsApi caches the range. */
export const loadEvents = (start: string, end: string): Promise<TagEvent[]> =>
  loadEventsInRange(start, end).then((events) =>
    events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      search: [e.title, e.city, e.location, ...(e.lineup ?? []).map((act) => act.name)].join(' ').toLowerCase(),
    })),
  );

export const eventLabel = (e: TagEvent) => `${e.title} · ${dayLabel(e.date)}`;
