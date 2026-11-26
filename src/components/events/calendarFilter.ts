/** The calendar's filter line: what it is set to, which events survive it, and
 *  what each facet offers with its counts. Counting a facet leaves that facet
 *  out of the match, so each option shows what choosing it would leave — the
 *  same scheme as the travel page. */

import type { FilterOption } from '../travel/TravelFilters';
import { EVENT_CATEGORIES, attendeesOf, cityKey, isHosted, type CalendarEvent, type EventCategory } from './eventTypes.ts';

export type HostFilter = '' | 'members' | 'mine';

/** What the filter line is set to. Labels are kept beside the values so a
 *  choice still reads right on a day or month that has none of it. */
export interface CalendarFilters {
  city: string;
  cityLabel: string;
  type: EventCategory | '';
  by: string;
  byLabel: string;
  host: HostFilter;
  /** '' for everyone's events, 'mine' for the member's own ticks, or the uid
   *  of a member who shares their calendar. */
  cal: string;
  calLabel: string;
}

export type FilterId = 'city' | 'type' | 'host' | 'by' | 'cal';

export const NO_FILTERS: CalendarFilters = {
  city: '',
  cityLabel: '',
  type: '',
  by: '',
  byLabel: '',
  host: '',
  cal: '',
  calLabel: '',
};

/** Who is looking, and what the page knows about the people on the calendar. */
export interface FilterViewer {
  uid?: string | null;
  /** Events the viewer has ticked. */
  interested: ReadonlySet<string>;
  people: ReadonlyMap<string, { username: string; shares: boolean }>;
}

export interface FacetCounts {
  id: FilterId;
  /** The word the filter line reads as the facet's key. */
  key: string;
  value: string;
  options: FilterOption[];
  /** How many events survive the other facets. */
  allCount: number;
}

/** Filters as stored, with anything unreadable dropped. */
export function filtersFrom(raw: unknown): CalendarFilters {
  if (!raw || typeof raw !== 'object') return NO_FILTERS;
  const r = raw as Record<string, unknown>;
  const text = (key: keyof CalendarFilters) => (typeof r[key] === 'string' ? (r[key] as string).slice(0, 200) : '');
  return {
    city: text('city'),
    cityLabel: text('cityLabel'),
    type: EVENT_CATEGORIES.some((c) => c.value === r.type) ? (r.type as EventCategory) : '',
    by: text('by'),
    byLabel: text('byLabel'),
    host: r.host === 'members' || r.host === 'mine' ? r.host : '',
    cal: text('cal'),
    calLabel: text('calLabel'),
  };
}

/** Does this event survive the filters, ignoring `skip`? */
export function matchesFilters(
  e: CalendarEvent,
  f: CalendarFilters,
  viewer: FilterViewer,
  skip: FilterId | null = null,
): boolean {
  return (
    (skip === 'city' || !f.city || cityKey(e.city ?? '') === f.city) &&
    (skip === 'type' || !f.type || e.category === f.type) &&
    (skip === 'by' || !f.by || e.userId === f.by) &&
    (skip === 'host' || !f.host || (isHosted(e) && (f.host === 'members' || e.userId === viewer.uid))) &&
    (skip === 'cal' || !f.cal || (f.cal === 'mine' ? viewer.interested.has(e.id) : attendeesOf(e).includes(f.cal)))
  );
}

/** The filters with one facet set to `value`, whose option reads `label`. */
export function choose(f: CalendarFilters, id: FilterId, value: string, label: string): CalendarFilters {
  switch (id) {
    case 'city':
      return { ...f, city: value, cityLabel: label };
    case 'type':
      return { ...f, type: value as EventCategory | '' };
    case 'host':
      return { ...f, host: value as HostFilter };
    case 'by':
      return { ...f, by: value, byLabel: label };
    case 'cal':
      return { ...f, cal: value, calLabel: value === 'mine' ? '' : label };
  }
}

const byCount = (a: FilterOption, b: FilterOption) => b.count - a.count || a.label.localeCompare(b.label);

/** Each facet's options and counts over the events on screen. */
export function facetsFor(inView: CalendarEvent[], f: CalendarFilters, viewer: FilterViewer): FacetCounts[] {
  const { uid, interested, people } = viewer;

  const count = (skip: FilterId, keysOf: (e: CalendarEvent) => string[]) => {
    const counts = new Map<string, number>();
    let all = 0;
    for (const e of inView) {
      if (!matchesFilters(e, f, viewer, skip)) continue;
      all += 1;
      for (const key of keysOf(e)) if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return { counts, all };
  };

  const cityLabels = new Map<string, string>();
  const userLabels = new Map<string, string>();
  const calLabels = new Map<string, string>();
  for (const e of inView) {
    if (e.city && !cityLabels.has(cityKey(e.city))) cityLabels.set(cityKey(e.city), e.city);
    if (e.userId && !userLabels.has(e.userId)) userLabels.set(e.userId, e.username || 'someone');
    for (const id of attendeesOf(e)) {
      const person = people.get(id);
      if (id !== uid && person?.shares) calLabels.set(id, person.username);
    }
  }
  // A choice stays on the line even where this stretch has none of it.
  if (f.city && !cityLabels.has(f.city)) cityLabels.set(f.city, f.cityLabel || f.city);
  if (f.by && !userLabels.has(f.by)) userLabels.set(f.by, f.byLabel || 'someone');
  if (f.cal && f.cal !== 'mine' && !calLabels.has(f.cal)) calLabels.set(f.cal, f.calLabel || 'someone');
  const calOptions = new Map(uid ? [['mine', 'mine'] as const, ...calLabels] : calLabels);

  const facet = (
    id: FilterId,
    key: string,
    labels: Map<string, string>,
    counted: { counts: Map<string, number>; all: number },
    sort = true,
  ): FacetCounts => {
    const options = Array.from(labels, ([value, label]) => ({ value, label, count: counted.counts.get(value) ?? 0 }));
    return { id, key, value: f[id], allCount: counted.all, options: sort ? options.sort(byCount) : options };
  };

  return [
    facet('city', 'city', cityLabels, count('city', (e) => [cityKey(e.city ?? '')])),
    facet('type', 'type', new Map(EVENT_CATEGORIES.map((c) => [c.value, c.label])), count('type', (e) => [e.category])),
    facet(
      'host',
      'hosted by',
      new Map(uid ? [['members', 'yabbyville members'], ['mine', 'me']] : [['members', 'yabbyville members']]),
      count('host', (e) => (isHosted(e) ? ['members', e.userId === uid ? 'mine' : ''] : [])),
      false,
    ),
    facet('by', 'added by', userLabels, count('by', (e) => [e.userId])),
    facet(
      'cal',
      'calendar',
      calOptions,
      count('cal', (e) => [interested.has(e.id) ? 'mine' : '', ...attendeesOf(e).filter((id) => id !== uid)]),
      false,
    ),
  ];
}
