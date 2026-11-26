/**
 * The calendar's filter line: stored filters read back, which events survive,
 * and each facet's options and counts.
 *
 *   node --test tests/calendar-filter/calendarFilter.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert';

import {
  NO_FILTERS,
  choose,
  facetsFor,
  filtersFrom,
  matchesFilters,
} from '../../src/components/events/calendarFilter.ts';

const ev = (id, over = {}) => ({
  id,
  title: id,
  date: '2026-12-01',
  category: 'gig',
  city: 'Glasgow',
  userId: 'ann',
  username: 'ann',
  interestedBy: [],
  goingBy: [],
  ...over,
});

const viewer = (over = {}) => ({ uid: 'me', interested: new Set(), people: new Map(), ...over });
const set = (over) => ({ ...NO_FILTERS, ...over });
const facet = (facets, id) => facets.find((f) => f.id === id);
const counts = (f) => Object.fromEntries(f.options.map((o) => [o.value, o.count]));

test('stored filters keep what is readable and drop the rest', () => {
  assert.deepStrictEqual(filtersFrom(null), NO_FILTERS);
  assert.deepStrictEqual(filtersFrom('nope'), NO_FILTERS);
  const read = filtersFrom({ city: 'glasgow', type: 'not-a-type', host: 'everyone', cal: 'x'.repeat(300), by: 7 });
  assert.strictEqual(read.city, 'glasgow');
  assert.strictEqual(read.type, '');
  assert.strictEqual(read.host, '');
  assert.strictEqual(read.cal.length, 200);
  assert.strictEqual(read.by, '');
  assert.strictEqual(filtersFrom({ type: 'radio', host: 'mine' }).type, 'radio');
});

test('no filters lets everything through', () => {
  assert.ok(matchesFilters(ev('a'), NO_FILTERS, viewer()));
});

test('city matches case-insensitively by key', () => {
  assert.ok(matchesFilters(ev('a', { city: 'GLASGOW ' }), set({ city: 'glasgow' }), viewer()));
  assert.ok(!matchesFilters(ev('a', { city: 'Leeds' }), set({ city: 'glasgow' }), viewer()));
});

test('hosted by: members takes hosted events, mine only the viewer\'s', () => {
  const hosted = ev('a', { hosted: true });
  const told = ev('b', { hosted: false });
  const own = ev('c', { hosted: true, userId: 'me' });
  assert.ok(matchesFilters(hosted, set({ host: 'members' }), viewer()));
  assert.ok(!matchesFilters(told, set({ host: 'members' }), viewer()));
  assert.ok(!matchesFilters(hosted, set({ host: 'mine' }), viewer()));
  assert.ok(matchesFilters(own, set({ host: 'mine' }), viewer()));
});

test('calendar: mine is the viewer\'s ticks, a uid is that member\'s', () => {
  const a = ev('a', { goingBy: ['bo'] });
  assert.ok(matchesFilters(a, set({ cal: 'mine' }), viewer({ interested: new Set(['a']) })));
  assert.ok(!matchesFilters(a, set({ cal: 'mine' }), viewer()));
  assert.ok(matchesFilters(a, set({ cal: 'bo' }), viewer()));
  assert.ok(!matchesFilters(a, set({ cal: 'cy' }), viewer()));
});

test('a facet counts over the other facets only', () => {
  const events = [ev('a'), ev('b', { city: 'Leeds' }), ev('c', { category: 'club' })];
  const facets = facetsFor(events, set({ city: 'glasgow', type: 'gig' }), viewer());
  // Counting cities ignores the city choice but keeps type = gig.
  assert.deepStrictEqual(counts(facet(facets, 'city')), { glasgow: 1, leeds: 1 });
  assert.strictEqual(facet(facets, 'city').allCount, 2);
  // Counting types ignores the type choice but keeps city = glasgow.
  assert.strictEqual(counts(facet(facets, 'type')).club, 1);
  assert.strictEqual(facet(facets, 'type').allCount, 2);
});

test('options sort by count then label, except hosted by and calendar', () => {
  const events = [ev('a', { city: 'York' }), ev('b', { city: 'Bath' }), ev('c', { city: 'York' })];
  const facets = facetsFor(events, NO_FILTERS, viewer());
  assert.deepStrictEqual(facet(facets, 'city').options.map((o) => o.label), ['York', 'Bath']);
  assert.deepStrictEqual(facet(facets, 'host').options.map((o) => o.value), ['members', 'mine']);
});

test('a choice stays offered when nothing on screen has it', () => {
  const facets = facetsFor([ev('a')], set({ city: 'leeds', cityLabel: 'Leeds', by: 'zed', byLabel: 'zed' }), viewer());
  assert.ok(facet(facets, 'city').options.some((o) => o.value === 'leeds' && o.label === 'Leeds' && o.count === 0));
  assert.ok(facet(facets, 'by').options.some((o) => o.value === 'zed'));
});

test('calendar offers mine and members who share, never the viewer', () => {
  const people = new Map([
    ['bo', { username: 'bo', shares: true }],
    ['cy', { username: 'cy', shares: false }],
  ]);
  const facets = facetsFor([ev('a', { goingBy: ['bo', 'cy', 'me'] })], NO_FILTERS, viewer({ people }));
  assert.deepStrictEqual(facet(facets, 'cal').options.map((o) => o.value), ['mine', 'bo']);
  const signedOut = facetsFor([ev('a', { goingBy: ['bo'] })], NO_FILTERS, viewer({ uid: null, people }));
  assert.deepStrictEqual(facet(signedOut, 'cal').options.map((o) => o.value), ['bo']);
  assert.deepStrictEqual(facet(signedOut, 'host').options.map((o) => o.value), ['members']);
});

test('choosing sets the value and its label', () => {
  assert.deepStrictEqual(choose(NO_FILTERS, 'city', 'leeds', 'Leeds'), set({ city: 'leeds', cityLabel: 'Leeds' }));
  assert.deepStrictEqual(choose(NO_FILTERS, 'cal', 'mine', 'mine'), set({ cal: 'mine', calLabel: '' }));
  assert.deepStrictEqual(choose(NO_FILTERS, 'type', 'radio', 'radio'), set({ type: 'radio' }));
});
