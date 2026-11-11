/**
 * The profile draft: what a saved profile turns into for editing, and the
 * checks a draft must pass before it is written. The username limits are the
 * ones isValidUsername in firestore.rules enforces.
 *
 *   node --test tests/profile-draft/profileDraft.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert';

import {
  EMPTY_PROFILE,
  USERNAME_MAX,
  USERNAME_MIN,
  draftFrom,
  normaliseUsername,
  sameSocials,
  validateProfileDraft,
} from '../../src/components/profile/profileDraft.ts';

const draft = (username, socials = []) => ({ username, socials });
const row = (platform, value, id = 0) => ({ id, platform, value });
const errorOf = (result) => ('error' in result ? result.error : null);

test('a username at each length limit passes, one past either fails', () => {
  assert.equal(errorOf(validateProfileDraft(draft('a'.repeat(USERNAME_MIN)))), null);
  assert.equal(errorOf(validateProfileDraft(draft('a'.repeat(USERNAME_MAX)))), null);
  assert.match(errorOf(validateProfileDraft(draft('a'.repeat(USERNAME_MIN - 1)))), /2–20 characters/);
  assert.match(errorOf(validateProfileDraft(draft('a'.repeat(USERNAME_MAX + 1)))), /2–20 characters/);
});

test('the length is judged after spaces are tidied', () => {
  assert.match(errorOf(validateProfileDraft(draft('  a  '))), /characters/);
  const ok = validateProfileDraft(draft('  al   ice  '));
  assert.equal(ok.username, 'al ice');
});

test('usernames follow the rules pattern', () => {
  for (const good of ['alice', 'Al1ce', 'a.b', 'a-b', 'a_b', 'a b', 'a.b-c_d e']) {
    assert.equal(errorOf(validateProfileDraft(draft(good))), null, good);
  }
  for (const bad of ['.ab', 'ab.', 'a..b', 'a-_b', 'ab!', 'héllo']) {
    assert.match(errorOf(validateProfileDraft(draft(bad))) ?? '', /start and end with a letter or number/, bad);
  }
});

test('normaliseUsername collapses runs of whitespace and trims', () => {
  assert.equal(normaliseUsername('  a \t  b '), 'a b');
});

test('socials: blank rows are dropped, a valid handle is reduced, a bad one is the error', () => {
  const ok = validateProfileDraft(draft('alice', [row('', 'x'), row('instagram', '   '), row('instagram', '@Some.One', 1)]));
  assert.equal(errorOf(ok), null);
  assert.deepEqual(Object.keys(ok.socials), ['instagram']);

  const bad = validateProfileDraft(draft('alice', [row('instagram', 'not a handle!!')]));
  assert.match(errorOf(bad), /^instagram: /);
});

test('the username is checked before socials', () => {
  assert.match(errorOf(validateProfileDraft(draft('!!', [row('instagram', 'not a handle!!')]))), /start and end/);
});

test('draftFrom lists only the socials that are set, in platform order, with fresh ids', () => {
  let n = 10;
  const d = draftFrom({ ...EMPTY_PROFILE, username: 'a', socials: { instagram: 'x' } }, () => n++);
  assert.equal(d.username, 'a');
  assert.deepEqual(d.socials, [{ id: 10, platform: 'instagram', value: 'x' }]);
});

test('sameSocials compares every platform', () => {
  assert.equal(sameSocials({ instagram: 'a' }, { instagram: 'a' }), true);
  assert.equal(sameSocials({ instagram: 'a' }, {}), false);
});
