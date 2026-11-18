import test from 'node:test';
import assert from 'node:assert/strict';
import { isTravelPlaceLink, listablePlaces, searchListPlaces, travelPlaceLink } from '../../src/utils/listPlaces.ts';
import { visibleRecommendations } from '../../src/components/travel/recommendationVisibility.ts';

test('location links preserve and encode the travel id without treating external URLs as internal links', () => {
  const link = travelPlaceLink('node/123 & x');
  assert.equal(link, '/travel?place=node%2F123%20%26%20x');
  assert.equal(new URL(link, 'https://example.com').searchParams.get('place'), 'node/123 & x');
  assert.equal(isTravelPlaceLink(link), true);
  for (const other of [undefined, '', '/travel', '/travel?place=', '/travel?city=x', '/travel?place=x&user=y', 'https://example.com/travel?place=x', '//example.com/travel?place=x']) {
    assert.equal(isTravelPlaceLink(other), false);
  }
});

test('a deep-linked location outside the first page is visible without expanding the whole list', () => {
  const places = Array.from({ length: 100 }, (_, i) => ({ id: String(i) }));
  assert.deepEqual(visibleRecommendations(places, 20, false, '99').map((place) => place.id), [
    ...places.slice(0, 20).map((place) => place.id), '99',
  ]);
  assert.equal(visibleRecommendations(places, 20, false, '1').length, 20);
  assert.equal(visibleRecommendations(places, 20, false, 'missing').length, 20);
  assert.equal(visibleRecommendations(places, 20, true, '99').length, 100);
});

test('only active, named travel places can be searched by name, city and country', () => {
  const places = listablePlaces([
    { id: 'a', data: { displayName: 'Alpha, London', city: 'London', country: 'UK', contributorCount: 1 } },
    { id: 'b', data: { displayName: 'Alpha', city: 'Paris', country: 'France', contributorCount: 2 } },
    { id: 'c', data: { displayName: 'Deleted', contributorCount: 0 } },
    { id: 'd', data: { displayName: 'Bad', contributorCount: 'invalid' } },
    { id: 'e', data: { displayName: '', contributorCount: 1 } },
  ]);
  assert.deepEqual(places.map((place) => place.id), ['a', 'b']);
  assert.deepEqual(searchListPlaces(places, 'ALPHA london UK').map((place) => place.id), ['a']);
  assert.deepEqual(searchListPlaces(places, 'france').map((place) => place.id), ['b']);
  assert.deepEqual(searchListPlaces(places, '  '), []);
  assert.deepEqual(searchListPlaces(places, 'missing'), []);
});
