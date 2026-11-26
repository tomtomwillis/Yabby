/**
 * The event form's draft: what the form's fields become when saved, and the
 * message for each field the rules would refuse.
 *
 *   node --test tests/event-draft/eventDraft.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert';

import { buildEventDraft } from '../../src/components/events/eventDraft.ts';
import { EVENT_LIMITS } from '../../src/components/events/eventTypes.ts';

const form = (over = {}) => ({
  title: 'Night',
  date: '2026-12-01',
  category: 'gig',
  time: '',
  endTime: '',
  timeZone: 'Europe/London',
  location: '',
  city: 'Glasgow',
  lineup: [],
  cost: '',
  description: '',
  comment: '',
  urls: [''],
  imageId: undefined,
  hosted: false,
  ...over,
});

test('the bare minimum becomes a draft with every optional field left out', () => {
  assert.deepStrictEqual(buildEventDraft(form()), {
    title: 'Night',
    date: '2026-12-01',
    category: 'gig',
    time: undefined,
    endTime: undefined,
    timeZone: undefined,
    location: undefined,
    city: 'Glasgow',
    lineup: [],
    cost: undefined,
    description: undefined,
    comment: undefined,
    urls: [],
    imageId: undefined,
    hosted: false,
  });
});

test('the title, location and cost lose tags and fold whitespace', () => {
  const draft = buildEventDraft(form({ title: '  <b>Big</b>\n  night ', location: ' The   Hall ', cost: '<i>£5</i>' }));
  assert.strictEqual(draft.title, 'Big night');
  assert.strictEqual(draft.location, 'The Hall');
  assert.strictEqual(draft.cost, '£5');
});

test('a title of only tags is no title', () => {
  assert.strictEqual(buildEventDraft(form({ title: '<b></b>' })), 'Give the event a title.');
});

test('text is cut to the rules limits', () => {
  const draft = buildEventDraft(form({ title: 'x'.repeat(EVENT_LIMITS.title + 5), description: 'd'.repeat(EVENT_LIMITS.description + 5) }));
  assert.strictEqual(draft.title.length, EVENT_LIMITS.title);
  assert.strictEqual(draft.description.length, EVENT_LIMITS.description);
});

test('a date and times must be well formed', () => {
  assert.strictEqual(buildEventDraft(form({ date: '1 Dec' })), 'Pick a date.');
  assert.strictEqual(buildEventDraft(form({ time: '25:99' })), 'The start time is not a time.');
  assert.strictEqual(buildEventDraft(form({ endTime: '22:00' })), 'Add a start time before an end time.');
  assert.strictEqual(buildEventDraft(form({ time: '20:00', endTime: 'late' })), 'The end time is not a time.');
});

test('the time zone is kept only with a start time', () => {
  assert.strictEqual(buildEventDraft(form()).timeZone, undefined);
  const timed = buildEventDraft(form({ time: '20:00', endTime: '23:00', timeZone: 'Europe/Berlin' }));
  assert.deepStrictEqual([timed.time, timed.endTime, timed.timeZone], ['20:00', '23:00', 'Europe/Berlin']);
});

test('a city is required and must be a name', () => {
  assert.strictEqual(buildEventDraft(form({ city: '   ' })), 'Add the city it is in.');
  assert.match(buildEventDraft(form({ city: 'G1 2AB' })), /^A city is letters/);
  assert.strictEqual(buildEventDraft(form({ city: '  St.   Andrews ' })).city, 'St. Andrews');
});

test('a lineup over the limit says how many to remove', () => {
  const lineup = Array.from({ length: EVENT_LIMITS.lineup + 2 }, (_, i) => ({ name: `act ${i}` }));
  assert.match(buildEventDraft(form({ lineup })), /Remove 2 to save\.$/);
});

test('links get https://, lose blanks and duplicates, and are capped', () => {
  const draft = buildEventDraft(form({ urls: ['dice.fm/event/x', '', 'https://dice.fm/event/x', 'http://a.org'] }));
  assert.deepStrictEqual(draft.urls, ['https://dice.fm/event/x', 'http://a.org']);
  const many = Array.from({ length: EVENT_LIMITS.urls + 3 }, (_, i) => `https://a.org/${i}`);
  assert.strictEqual(buildEventDraft(form({ urls: many })).urls.length, EVENT_LIMITS.urls);
});

test('a link that is not a web address names its position', () => {
  assert.strictEqual(buildEventDraft(form({ urls: ['https://a.org', 'not a link'] })), 'Link 2 is not a web address.');
  assert.strictEqual(buildEventDraft(form({ urls: ['javascript:alert(1)'] })), 'Link 1 is not a web address.');
  assert.strictEqual(buildEventDraft(form({ urls: ['https://a.org/🎉'] })), 'Link 1 is not a web address.');
  assert.strictEqual(buildEventDraft(form({ urls: [`https://a.org/${'x'.repeat(EVENT_LIMITS.url)}`] })), 'Link 1 is not a web address.');
});
