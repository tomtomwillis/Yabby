/** The event form's fields as a draft to save, or the message saying what to
 *  fix. The checks and limits are the ones isValidEventFields in
 *  firestore.rules enforces, so a draft that passes here is one the rules take. */

import type { EventDraft } from '../../utils/eventsApi';
import { normalizeSiteUrl, sanitizeText } from '../../utils/sanitise.ts';
import {
  EVENT_LIMITS,
  isValidCityName,
  isValidEventDate,
  isValidEventTime,
  type EventCategory,
  type LineupAct,
} from './eventTypes.ts';

/** What the form holds, as typed. */
export interface EventFormValues {
  title: string;
  date: string;
  category: EventCategory;
  time: string;
  endTime: string;
  timeZone: string;
  location: string;
  city: string;
  lineup: LineupAct[];
  cost: string;
  description: string;
  comment: string;
  urls: string[];
  imageId?: string;
  hosted: boolean;
}

/** One line of text as the rules want it: tags stripped, whitespace folded. */
const oneLine = (value: string) => sanitizeText(value).replace(/\s+/g, ' ').trim();

export function buildEventDraft(form: EventFormValues): EventDraft | string {
  const cleanTitle = oneLine(form.title);
  if (!cleanTitle) return 'Give the event a title.';
  if (!isValidEventDate(form.date)) return 'Pick a date.';
  if (form.time && !isValidEventTime(form.time)) return 'The start time is not a time.';
  if (form.endTime && !form.time) return 'Add a start time before an end time.';
  if (form.endTime && !isValidEventTime(form.endTime)) return 'The end time is not a time.';

  const cleanCity = form.city.trim().replace(/\s+/g, ' ');
  if (!cleanCity) return 'Add the city it is in.';
  if (!isValidCityName(cleanCity)) {
    return 'A city is letters, with spaces, hyphens, apostrophes or full stops between them.';
  }

  if (form.lineup.length > EVENT_LIMITS.lineup) {
    return `An event can have at most ${EVENT_LIMITS.lineup} acts in its lineup. Remove ${form.lineup.length - EVENT_LIMITS.lineup} to save.`;
  }

  const links: string[] = [];
  for (const [i, raw] of form.urls.entries()) {
    if (!raw.trim()) continue;
    const url = normalizeSiteUrl(raw);
    // The rules refuse characters outside the BMP (emoji) in a link.
    if (!url || url.length > EVENT_LIMITS.url || /[\u{10000}-\u{10FFFF}]/u.test(url)) return `Link ${i + 1} is not a web address.`;
    if (!links.includes(url)) links.push(url);
  }

  return {
    title: cleanTitle.slice(0, EVENT_LIMITS.title),
    date: form.date,
    category: form.category,
    time: form.time || undefined,
    endTime: form.time && form.endTime ? form.endTime : undefined,
    timeZone: form.time ? form.timeZone : undefined,
    location: oneLine(form.location).slice(0, EVENT_LIMITS.location) || undefined,
    city: cleanCity,
    lineup: form.lineup,
    cost: oneLine(form.cost).slice(0, EVENT_LIMITS.cost) || undefined,
    description: sanitizeText(form.description).trim().slice(0, EVENT_LIMITS.description) || undefined,
    comment: sanitizeText(form.comment).trim().slice(0, EVENT_LIMITS.comment) || undefined,
    urls: links.slice(0, EVENT_LIMITS.urls),
    imageId: form.imageId,
    hosted: form.hosted,
  };
}
