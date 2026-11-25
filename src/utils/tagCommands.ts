import { addDays, todayISO } from '../components/events/eventTypes.ts';

/*
 * The @ and / commands every tagging text box shares. Pure, so the parsing can
 * be tested without a browser; useTagging does the loading and inserting.
 */

/** Inserted links are stored in posts, so they must not depend on the current
 *  origin (e.g. localhost during development). */
export const SITE_ORIGIN = 'https://yabbyville.xyz';

export type SearchCommand =
  | 'artist' | 'album' | 'track' | 'playlist'
  | 'list' | 'travel' | 'city' | 'event' | 'issueresolved';

export interface SearchCommandInfo {
  name: SearchCommand;
  /** Other names that open the same search. */
  aliases: string[];
  /** Shown beside the command in the / menu. */
  hint: string;
  /** Heading over its results. */
  heading: string;
}

export const SEARCH_COMMANDS: readonly SearchCommandInfo[] = [
  { name: 'artist', aliases: [], hint: 'search artists in the library', heading: 'artists' },
  { name: 'album', aliases: [], hint: 'search albums in the library', heading: 'albums' },
  { name: 'track', aliases: ['song'], hint: 'search tracks in the library', heading: 'tracks' },
  { name: 'playlist', aliases: [], hint: 'search public playlists', heading: 'playlists' },
  { name: 'list', aliases: [], hint: 'search lists', heading: 'lists' },
  { name: 'event', aliases: ['calendar'], hint: 'link an event — try "jan" or "past jan"', heading: 'events' },
  { name: 'travel', aliases: [], hint: 'search travel recs', heading: 'places' },
  { name: 'city', aliases: [], hint: 'link a city\'s travel recs', heading: 'cities' },
  { name: 'issueresolved', aliases: [], hint: 'link an issue', heading: 'issues' },
];

export const INSTANT_COMMANDS: Record<string, { label: string; path: string }> = {
  filmclub: { label: 'Film Club', path: '/film-club' },
  radio: { label: 'Radio', path: '/radio' },
  news: { label: 'News', path: '/news' },
  stickers: { label: 'Stickers', path: '/stickers' },
  wiki: { label: 'Wiki', path: '/wiki' },
  issues: { label: 'Issues', path: '/issues' },
};

/** Longest stretch after an @ or / that still counts as a search. */
const MAX_TRIGGER_TEXT = 60;

export interface Trigger {
  kind: '@' | '/';
  /** Index of the @ or / in the text. */
  start: number;
  /** What has been typed after it, up to the caret. */
  text: string;
}

/** The @ or / that starts a word nearest before the caret, on the same line. */
export function findTrigger(value: string, caret: number): Trigger | null {
  for (let i = caret - 1; i >= 0 && caret - i <= MAX_TRIGGER_TEXT + 1; i--) {
    const ch = value[i];
    if (ch === '\n') return null;
    if ((ch === '@' || ch === '/') && (i === 0 || /\s/.test(value[i - 1]))) {
      const text = value.slice(i + 1, caret);
      // "meet @ 5" or "a / b" — nothing being searched for.
      if (/^\s/.test(text)) return null;
      return { kind: ch, start: i, text };
    }
  }
  return null;
}

/** The search a typed command name opens, by its name or one of its aliases. */
export function resolveSearchCommand(word: string): SearchCommandInfo | null {
  const w = word.toLowerCase();
  return SEARCH_COMMANDS.find((c) => c.name === w || c.aliases.includes(w)) ?? null;
}

/** "/event past jan" → { command: 'event', term: 'past jan' }; term is null
 *  until a space follows the command. */
export function splitSlash(text: string): { command: string; term: string | null } {
  const space = text.indexOf(' ');
  if (space === -1) return { command: text.toLowerCase(), term: null };
  return { command: text.slice(0, space).toLowerCase(), term: text.slice(space + 1) };
}

/** The name to show for a command while `typed` is being typed: the alias if
 *  that is what they are typing, otherwise its own name. Null if neither fits. */
export function commandNameFor(info: SearchCommandInfo, typed: string): string | null {
  const t = typed.toLowerCase();
  if (info.name.startsWith(t)) return info.name;
  return info.aliases.find((a) => a.startsWith(t)) ?? null;
}

// ---------------------------------------------------------------------------
// /event queries
// ---------------------------------------------------------------------------

/** The window a plain /event search covers. Each event in it is a read, so it
 *  stays short; eventsApi caches the range for a few minutes. */
export const EVENT_SEARCH_DAYS = 60;
export const EVENT_PAST_DAYS = 20;

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** 0–11 for a month name or its first three letters or more ("jan", "sept"). */
export function monthIndex(word: string): number | null {
  const w = word.toLowerCase();
  if (w.length < 3) return null;
  const i = MONTHS.findIndex((m) => m.startsWith(w));
  return i === -1 ? null : i;
}

export interface EventQuery {
  /** The date range to load, inclusive. */
  start: string;
  end: string;
  /** Upcoming only, past only, or both (upcoming first). */
  when: 'upcoming' | 'past' | 'any';
  /** The month asked for, as its first day, or null. */
  month: string | null;
  /** Name, city, venue or act to match, lower-cased. */
  text: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDayOf = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/**
 * "jan" is the next January to come (this one, if it is January now),
 * "past jan" the last one to have started; "past" alone is the last few
 * weeks. Anything after those words is matched against the event.
 */
export function parseEventQuery(term: string, today: string = todayISO()): EventQuery {
  const words = term.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let past = false;
  if (words[0] === 'past') {
    past = true;
    words.shift();
  }
  const month = words.length > 0 ? monthIndex(words[0]) : null;
  if (month !== null) words.shift();
  const text = words.join(' ');

  if (month === null) {
    return {
      start: addDays(today, -EVENT_PAST_DAYS),
      end: addDays(today, EVENT_SEARCH_DAYS),
      when: past ? 'past' : 'any',
      month: null,
      text,
    };
  }

  const thisYear = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7)) - 1;
  const year = past
    ? (month > thisMonth ? thisYear - 1 : thisYear)
    : (month < thisMonth ? thisYear + 1 : thisYear);
  const first = `${year}-${pad(month + 1)}-01`;
  return {
    start: first,
    end: `${year}-${pad(month + 1)}-${pad(lastDayOf(year, month))}`,
    when: past ? 'past' : 'upcoming',
    month: first,
    text,
  };
}

/** The events a query asks for, in the order to list them. `events` must be in
 *  date order. */
export function pickEvents<T extends { date: string; search: string }>(
  events: readonly T[],
  q: EventQuery,
  today: string = todayISO(),
): T[] {
  const matches = events.filter((e) => !q.text || e.search.includes(q.text));
  const upcoming = matches.filter((e) => e.date >= today);
  const past = matches.filter((e) => e.date < today);
  if (q.when === 'upcoming') return upcoming;
  // A month reads best in date order; the last few weeks, most recent first.
  if (q.when === 'past') return q.month ? past : past.reverse();
  return [...upcoming, ...past.reverse()];
}
