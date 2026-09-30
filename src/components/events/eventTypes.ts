/** Shared shapes and date helpers for the calendar, its home widget and the
 *  event hover card. Limits mirror isValidEventFields in firestore.rules. */

export type EventCategory = 'radio' | 'club' | 'gig' | 'release' | 'event' | 'other';

export const EVENT_CATEGORIES: { value: EventCategory; label: string; colour: string }[] = [
  { value: 'gig', label: 'gig', colour: '#1a2ecc' },
  { value: 'club', label: 'club', colour: '#f52bc9' },
  { value: 'radio', label: 'radio', colour: '#8825e6' },
  { value: 'release', label: 'release', colour: '#3a9d3f' },
  { value: 'event', label: 'event', colour: '#e0721a' },
  { value: 'other', label: 'other', colour: '#6b7280' },
];

export function categoryColour(category: EventCategory): string {
  return EVENT_CATEGORIES.find((c) => c.value === category)?.colour ?? '#5566c9';
}

/** One act on the bill. `artistId` when the act is in the Navidrome library;
 *  without it the name is shown as written, with no link. */
export interface LineupAct {
  name: string;
  artistId?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** Wall-clock date at the venue, "YYYY-MM-DD". */
  date: string;
  category: EventCategory;
  /** "HH:MM", absent for an all-day event. */
  time?: string;
  endTime?: string;
  /** The IANA zone the times are in. Absent on an all-day event, and on
   *  events saved before zones existed, which are UK time. */
  timeZone?: string;
  /** May carry @-tags — [Artist](navidrome link) — rendered like a post. */
  description?: string;
  /** The author's own word on why they are interested. Plain text. */
  comment?: string;
  location?: string;
  city?: string;
  lineup?: LineupAct[];
  cost?: string;
  urls?: string[];
  imageId?: string;
  /** The author says it is their own event. Absent on events saved before the
   *  flag existed, when only hosts could add one — see isHosted. */
  hosted?: boolean;
  /** Who ticked "interested?" and "going", public like a post's likes. A
   *  member is in one list or neither, never both. */
  interestedBy: string[];
  interestCount: number;
  goingBy: string[];
  goingCount: number;
  userId: string;
  username: string;
}

export const isHosted = (event: Pick<CalendarEvent, 'hosted'>) => event.hosted !== false;

export type EventStatus = 'interested' | 'going';

/** Everyone with the event in their calendar, interested or going. */
export const attendeesOf = (event: Pick<CalendarEvent, 'interestedBy' | 'goingBy'>) => [
  ...event.interestedBy,
  ...event.goingBy,
];

/** The member's status from their private lists: `ids` is every event in their
 *  calendar, `going` the ones they have a ticket for. */
export function statusFrom(id: string, ids: ReadonlySet<string>, going: ReadonlySet<string>): EventStatus | null {
  if (going.has(id)) return 'going';
  return ids.has(id) ? 'interested' : null;
}

/**
 * Who is interested in and going to an event, with the member's own status
 * applied at once: the event's copy only catches up on the next read, and the
 * private list is what the member just changed.
 */
export function attendanceIn(
  event: CalendarEvent,
  uid: string | null,
  mine: { ids: ReadonlySet<string>; going: ReadonlySet<string>; ready: boolean },
) {
  const counted: EventStatus | null =
    !uid ? null : event.goingBy.includes(uid) ? 'going' : event.interestedBy.includes(uid) ? 'interested' : null;
  // Until the private list has loaded, the event's own copy is the best guess.
  const status = !uid ? null : mine.ready ? statusFrom(event.id, mine.ids, mine.going) : counted;
  const side = (list: string[], count: number, which: EventStatus) => {
    const others = uid ? list.filter((id) => id !== uid) : list;
    const on = status === which;
    return {
      count: Math.max(0, count - (counted === which ? 1 : 0) + (on ? 1 : 0)),
      userIds: on && uid ? [uid, ...others] : others,
    };
  };
  return {
    status,
    interested: side(event.interestedBy, event.interestCount, 'interested'),
    going: side(event.goingBy, event.goingCount, 'going'),
  };
}

export const EVENT_LIMITS = {
  title: 120,
  description: 2000,
  comment: 500,
  location: 200,
  city: 60,
  cost: 60,
  url: 500,
  urls: 5,
  act: 100,
  lineup: 20,
} as const;

/** An IANA zone name's shape: "Europe/London", "America/Argentina/Buenos_Aires",
 *  "Etc/GMT+5", "UTC". Mirrors isValidEventTimeZone in firestore.rules, which
 *  can only check the shape — whether the zone is real is Intl's call, here
 *  and in the backend's feed. */
const TIME_ZONE_RE = /^(?:UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2})$/;

export const DEFAULT_TIME_ZONE = 'Europe/London';

/** The zones the form offers. One city stands for each, so summer time follows
 *  the event's own date. Any other valid zone saved on an event still works. */
export const EVENT_TIME_ZONES = [
  { value: 'Europe/London', label: 'GMT/BST · UK & Ireland', note: 'uk time' },
  { value: 'Europe/Paris', label: 'CET · Central Europe', note: 'central european time' },
  { value: 'Europe/Athens', label: 'EET · Eastern Europe', note: 'eastern european time' },
  { value: 'America/New_York', label: 'EST · US & Canada Eastern', note: 'us eastern time' },
  { value: 'America/Chicago', label: 'CST · US & Canada Central', note: 'us central time' },
  { value: 'America/Denver', label: 'MST · US & Canada Mountain', note: 'us mountain time' },
  { value: 'America/Los_Angeles', label: 'PST · US & Canada Pacific', note: 'us pacific time' },
  { value: 'America/Sao_Paulo', label: 'BRT · Brazil', note: 'brazil time' },
  { value: 'Asia/Kolkata', label: 'IST · India', note: 'india time' },
  { value: 'Asia/Tokyo', label: 'JST · Japan & Korea', note: 'japan time' },
  { value: 'Australia/Sydney', label: 'AEST · Eastern Australia', note: 'sydney time' },
  { value: 'UTC', label: 'UTC', note: 'utc' },
];

/** A zone this browser can work with. */
export function isValidEventTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64 || !TIME_ZONE_RE.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Minutes `zone` is ahead of UTC at `when`. */
function offsetMinutes(zone: string, when: Date): number {
  // On the minute, since the wall clock below is read to the minute.
  const date = new Date(Math.floor(when.getTime() / 60_000) * 60_000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((wall - date.getTime()) / 60_000);
}

let viewerZone: string | null = null;

/** The offered zone the viewer's own clock keeps, matched on its winter and
 *  summer offsets so Berlin finds CET and Toronto EST. UK time when none
 *  matches. */
export function viewerTimeZone(): string {
  if (viewerZone) return viewerZone;
  viewerZone = DEFAULT_TIME_ZONE;
  try {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const year = new Date().getFullYear();
    const probes = [new Date(Date.UTC(year, 0, 15, 12)), new Date(Date.UTC(year, 6, 15, 12))];
    const match = EVENT_TIME_ZONES.find((zone) =>
      probes.every((d) => offsetMinutes(zone.value, d) === offsetMinutes(local, d)),
    );
    if (match) viewerZone = match.value;
  } catch {
    /* no Intl time zones — UK time */
  }
  return viewerZone;
}

/** "uk time", "japan time" beside an event's times — only for a viewer whose
 *  clock reads differently that day, since for everyone else it goes without
 *  saying. */
export function zoneNote(event: Pick<CalendarEvent, 'date' | 'time' | 'timeZone'>): string {
  if (!event.time) return '';
  const zone = event.timeZone ?? DEFAULT_TIME_ZONE;
  const viewer = viewerTimeZone();
  if (zone === viewer) return '';
  try {
    const day = new Date(`${event.date}T12:00:00Z`);
    if (offsetMinutes(zone, day) === offsetMinutes(viewer, day)) return '';
    const offered = EVENT_TIME_ZONES.find((z) => z.value === zone);
    if (offered) return offered.note;
    return `${zone.slice(zone.lastIndexOf('/') + 1).replace(/_/g, ' ').toLowerCase()} time`;
  } catch {
    return '';
  }
}

const DATE_RE = /^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const CITY_RE = /^\p{L}[\p{L} .'’-]*$/u;
const ARTIST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Letters in any script, with spaces, full stops, hyphens and apostrophes
 *  between them — the same test the rules apply. */
export const isValidCityName = (value: string) =>
  value.length >= 1 && [...value].length <= EVENT_LIMITS.city && CITY_RE.test(value);

/** How cities are compared and stored: the lowercased name. */
export const cityKey = (name: string) => name.trim().toLowerCase();
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const IMAGE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EVENT_ID_RE = /^[A-Za-z0-9]{1,40}$/;

export const isValidEventDate = (value: string) => DATE_RE.test(value);
export const isValidEventTime = (value: string) => TIME_RE.test(value);
export const isValidEventImageId = (value: string) => IMAGE_ID_RE.test(value);

/** A Firestore document's data as an event, or null when it is not one — the
 *  rules already hold every write to this shape, so this only guards reads of
 *  something unexpected rather than validating members' input. */
export function toCalendarEvent(id: string, data: Record<string, unknown>): CalendarEvent | null {
  const category = EVENT_CATEGORIES.some((c) => c.value === data.category) ? (data.category as EventCategory) : null;
  if (typeof data.title !== 'string' || typeof data.date !== 'string' || !category) return null;
  const str = (key: string) => (typeof data[key] === 'string' && data[key] ? (data[key] as string) : undefined);
  return {
    id,
    title: data.title,
    date: data.date,
    category,
    time: str('time'),
    endTime: str('endTime'),
    timeZone: isValidEventTimeZone(data.timeZone) ? data.timeZone : undefined,
    description: str('description'),
    comment: str('comment'),
    location: str('location'),
    city: str('city'),
    lineup: Array.isArray(data.lineup)
      ? data.lineup
          .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object' && typeof a.name === 'string')
          .map((a) => ({
            name: a.name as string,
            artistId: typeof a.artistId === 'string' && ARTIST_ID_RE.test(a.artistId) ? a.artistId : undefined,
          }))
      : undefined,
    cost: str('cost'),
    urls: Array.isArray(data.urls) ? data.urls.filter((u): u is string => typeof u === 'string') : undefined,
    imageId: str('imageId'),
    hosted: typeof data.hosted === 'boolean' ? data.hosted : undefined,
    interestedBy: Array.isArray(data.interestedBy) ? data.interestedBy.filter((u): u is string => typeof u === 'string') : [],
    interestCount:
      typeof data.interestCount === 'number' && data.interestCount >= 0
        ? data.interestCount
        : Array.isArray(data.interestedBy) ? data.interestedBy.length : 0,
    goingBy: Array.isArray(data.goingBy) ? data.goingBy.filter((u): u is string => typeof u === 'string') : [],
    goingCount:
      typeof data.goingCount === 'number' && data.goingCount >= 0
        ? data.goingCount
        : Array.isArray(data.goingBy) ? data.goingBy.length : 0,
    userId: typeof data.userId === 'string' ? data.userId : '',
    username: typeof data.username === 'string' ? data.username : '',
  };
}

/** Date, then all-day before timed, then time, then title. */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.time ?? '').localeCompare(b.time ?? '') ||
    a.title.localeCompare(b.title)
  );
}

/** "The Basement, Glasgow" — venue and city, whichever there are. */
export function whereLabel(event: Pick<CalendarEvent, 'location' | 'city'>): string {
  return [event.location, event.city].filter(Boolean).join(', ');
}

/** "20:00", "20:00–03:00", or '' for all day. */
export function timeLabel(event: Pick<CalendarEvent, 'time' | 'endTime'>): string {
  if (!event.time) return '';
  return event.endTime ? `${event.time}–${event.endTime}` : event.time;
}

// ---------------------------------------------------------------------------
// Dates as "YYYY-MM-DD" strings in the viewer's local calendar
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local noon, so no daylight-saving shift can move it onto another day. */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, days: number): string {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Monday of the week holding `iso`. */
export function startOfWeek(iso: string): string {
  const weekday = (fromISODate(iso).getDay() + 6) % 7;
  return addDays(iso, -weekday);
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonths(iso: string, months: number): string {
  const date = fromISODate(startOfMonth(iso));
  date.setMonth(date.getMonth() + months);
  return toISODate(date);
}

/** Whole weeks, Monday first, covering the month that holds `iso`. */
export function monthGrid(iso: string): string[] {
  const first = startOfMonth(iso);
  const start = startOfWeek(first);
  const last = addDays(addMonths(first, 1), -1);
  const end = addDays(startOfWeek(last), 6);
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

export function weekDays(iso: string): string[] {
  const start = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const WEEKDAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_NAMES_LONG = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** "mon 28 sep" */
export function dayLabel(iso: string): string {
  const date = fromISODate(iso);
  return `${WEEKDAY_NAMES[(date.getDay() + 6) % 7]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

/** "28 sep – 4 oct", for the week starting on `weekStart`. */
export function weekRangeLabel(weekStart: string): string {
  const withoutDay = (iso: string) => dayLabel(iso).split(' ').slice(1).join(' ');
  return `${withoutDay(weekStart)} – ${withoutDay(addDays(weekStart, 6))}`;
}

/** "this week", "next week", "last week", or "week of 12 oct". */
export function weekTitle(weekStart: string, today: string): string {
  const offset = Math.round(
    (fromISODate(weekStart).getTime() - fromISODate(startOfWeek(today)).getTime()) / (7 * 86_400_000),
  );
  if (offset === 0) return 'this week';
  if (offset === 1) return 'next week';
  if (offset === -1) return 'last week';
  return `week of ${dayLabel(weekStart).split(' ').slice(1).join(' ')}`;
}

/** "september 2026" */
export function monthLabel(iso: string): string {
  const date = fromISODate(iso);
  return `${MONTH_NAMES_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

/** Links written into posts carry the live origin, so they work from anywhere. */
export const EVENT_SITE_ORIGIN = 'https://yabbyville.xyz';

/** "ra.co/events/123", for a link whose full address would not fit a line. */
export function linkLabel(url: string): string {
  try {
    const { host, pathname } = new URL(url);
    return `${host.replace(/^www\./, '')}${pathname === '/' ? '' : pathname}`;
  } catch {
    return url;
  }
}

export function eventPath(id: string): string {
  return `/calendar?event=${encodeURIComponent(id)}`;
}

/** The event id in a calendar link from this site, or null for any other URL. */
export function parseEventLink(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.origin !== EVENT_SITE_ORIGIN && url.origin !== window.location.origin) return null;
  if (url.pathname !== '/calendar') return null;
  const id = url.searchParams.get('event');
  return id && EVENT_ID_RE.test(id) ? id : null;
}
