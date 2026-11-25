/**
 * The @ and / commands the site's text boxes share: finding the trigger,
 * command names and aliases, and what /event's month words mean.
 *
 *   node --test tests/tag-commands/tagCommands.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert';

import {
  commandNameFor,
  findTrigger,
  monthIndex,
  parseEventQuery,
  pickEvents,
  resolveSearchCommand,
  splitSlash,
} from '../../src/utils/tagCommands.ts';

const at = (value) => findTrigger(value, value.length);

test('a trigger starts a word', () => {
  assert.deepStrictEqual(at('@bo'), { kind: '@', start: 0, text: 'bo' });
  assert.deepStrictEqual(at('hi /art'), { kind: '/', start: 3, text: 'art' });
  assert.strictEqual(at('tom@example.com'), null);
  assert.strictEqual(at('see https://x.com/a'), null);
  assert.strictEqual(at('and/or'), null);
});

test('nothing is searched after a bare @ or / followed by a space', () => {
  assert.strictEqual(at('meet @ 5'), null);
  assert.strictEqual(at('a / b'), null);
});

test('a trigger ends at a new line', () => {
  assert.strictEqual(at('@bob\nhello'), null);
});

test('a slash inside the search is part of it', () => {
  assert.deepStrictEqual(at('/artist ac/dc'), { kind: '/', start: 0, text: 'artist ac/dc' });
  assert.deepStrictEqual(at('@ac/dc'), { kind: '@', start: 0, text: 'ac/dc' });
});

test('an inserted link does not reopen the menu', () => {
  assert.strictEqual(at('[@Bob](https://yabbyville.xyz/user/abc) '), null);
});

test('the caret, not the end of the text, bounds the trigger', () => {
  assert.deepStrictEqual(findTrigger('/ev later text', 3), { kind: '/', start: 0, text: 'ev' });
});

test('commands split at the first space', () => {
  assert.deepStrictEqual(splitSlash('eve'), { command: 'eve', term: null });
  assert.deepStrictEqual(splitSlash('Event past jan'), { command: 'event', term: 'past jan' });
  assert.deepStrictEqual(splitSlash('track '), { command: 'track', term: '' });
});

test('aliases open the same search', () => {
  assert.strictEqual(resolveSearchCommand('calendar').name, 'event');
  assert.strictEqual(resolveSearchCommand('event').name, 'event');
  assert.strictEqual(resolveSearchCommand('song').name, 'track');
  assert.strictEqual(resolveSearchCommand('TRACK').name, 'track');
  assert.strictEqual(resolveSearchCommand('wiki'), null);
});

test('the / menu names a command the way it is being typed', () => {
  const event = resolveSearchCommand('event');
  assert.strictEqual(commandNameFor(event, ''), 'event');
  assert.strictEqual(commandNameFor(event, 'ev'), 'event');
  assert.strictEqual(commandNameFor(event, 'cal'), 'calendar');
  assert.strictEqual(commandNameFor(event, 'x'), null);
});

test('months by name or their first three letters', () => {
  assert.strictEqual(monthIndex('jan'), 0);
  assert.strictEqual(monthIndex('January'), 0);
  assert.strictEqual(monthIndex('sept'), 8);
  assert.strictEqual(monthIndex('ja'), null);
  assert.strictEqual(monthIndex('mayhem'), null);
  assert.strictEqual(monthIndex('decks'), null);
});

const TODAY = '2026-11-25';

test('a plain search covers the usual window', () => {
  const q = parseEventQuery('fabric', TODAY);
  assert.deepStrictEqual(q, { start: '2026-11-05', end: '2027-01-24', when: 'any', month: null, text: 'fabric' });
});

test('a month is the next one to come', () => {
  assert.deepStrictEqual(parseEventQuery('jan', TODAY), {
    start: '2027-01-01', end: '2027-01-31', when: 'upcoming', month: '2027-01-01', text: '',
  });
  assert.strictEqual(parseEventQuery('dec', TODAY).start, '2026-12-01');
  // This month still has days to come.
  assert.strictEqual(parseEventQuery('nov', TODAY).start, '2026-11-01');
  assert.strictEqual(parseEventQuery('feb', '2028-01-10').end, '2028-02-29');
});

test('past and a month is the last one to have started', () => {
  assert.deepStrictEqual(parseEventQuery('past jan', TODAY), {
    start: '2026-01-01', end: '2026-01-31', when: 'past', month: '2026-01-01', text: '',
  });
  assert.strictEqual(parseEventQuery('past dec', TODAY).start, '2025-12-01');
  assert.strictEqual(parseEventQuery('past nov', TODAY).start, '2026-11-01');
});

test('words after the month narrow the search', () => {
  const q = parseEventQuery('past  March  Fabric Live', TODAY);
  assert.strictEqual(q.month, '2026-03-01');
  assert.strictEqual(q.text, 'fabric live');
});

test('past alone is the last few weeks', () => {
  const q = parseEventQuery('past', TODAY);
  assert.strictEqual(q.when, 'past');
  assert.strictEqual(q.month, null);
});

const ev = (date, search = 'x') => ({ date, search });

test('a plain search lists upcoming soonest first, then past most recent first', () => {
  const events = [ev('2026-11-20'), ev('2026-11-22'), ev('2026-11-25'), ev('2026-12-01')];
  const picked = pickEvents(events, parseEventQuery('', TODAY), TODAY).map((e) => e.date);
  assert.deepStrictEqual(picked, ['2026-11-25', '2026-12-01', '2026-11-22', '2026-11-20']);
});

test('the current month upcoming leaves out the days gone', () => {
  const events = [ev('2026-11-02'), ev('2026-11-25'), ev('2026-11-30')];
  const picked = pickEvents(events, parseEventQuery('nov', TODAY), TODAY).map((e) => e.date);
  assert.deepStrictEqual(picked, ['2026-11-25', '2026-11-30']);
});

test('a past month lists in date order, the last few weeks most recent first', () => {
  const events = [ev('2026-11-02'), ev('2026-11-10'), ev('2026-11-25')];
  assert.deepStrictEqual(pickEvents(events, parseEventQuery('past nov', TODAY), TODAY).map((e) => e.date), ['2026-11-02', '2026-11-10']);
  assert.deepStrictEqual(pickEvents(events, parseEventQuery('past', TODAY), TODAY).map((e) => e.date), ['2026-11-10', '2026-11-02']);
});

test('text matches the event', () => {
  const events = [ev('2026-12-01', 'fabric london'), ev('2026-12-02', 'corsica studios')];
  assert.deepStrictEqual(pickEvents(events, parseEventQuery('dec fabric', TODAY), TODAY), [events[0]]);
});
