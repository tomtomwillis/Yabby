/**
 * The pure parts of the self-hosted sign-in: which method an identifier is,
 * the reset token from a link's fragment, the TOTP secret for manual entry,
 * Retry-After, the line shown for each error code, and the decisions behind
 * getting a lost Firebase session back from the backend session.
 *
 *   node --test tests/auth-flow/authFlow.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert';

import {
  FIREBASE_REFUSED,
  NETWORK_ERROR,
  RENEW_COOLDOWN_MS,
  authErrorMessage,
  firebaseExchangeFailure,
  groupSecret,
  isUnavailableCode,
  mayUseRenewedToken,
  memberErrorText,
  parseRetryAfter,
  renewFailureAction,
  secretFromTotpUri,
  shouldRenewAfterLoss,
  signInMethod,
  tokenFromHash,
} from '../../src/utils/authFlow.ts';

test('an identifier with an @ is an email, anything else a username', () => {
  assert.equal(signInMethod('alice@example.com'), 'email');
  assert.equal(signInMethod('@'), 'email');
  assert.equal(signInMethod('alice'), 'username');
  assert.equal(signInMethod('al ice'), 'username');
});

test('the reset token comes from #token=, with or without the #', () => {
  assert.equal(tokenFromHash('#token=abc123'), 'abc123');
  assert.equal(tokenFromHash('token=abc123'), 'abc123');
  assert.equal(tokenFromHash('#token=a%2Bb'), 'a+b');
  assert.equal(tokenFromHash('#other=1&token=xyz'), 'xyz');
});

test('a missing, empty or oversized token is null', () => {
  assert.equal(tokenFromHash(''), null);
  assert.equal(tokenFromHash('#'), null);
  assert.equal(tokenFromHash('#token='), null);
  assert.equal(tokenFromHash('#tok=abc'), null);
  assert.equal(tokenFromHash(`#token=${'a'.repeat(513)}`), null);
});

test('the secret is read out of an otpauth URI and grouped in fours', () => {
  const uri = 'otpauth://totp/Yabbyville:alice?secret=jbswy3dpehpk3pxp&issuer=Yabbyville';
  assert.equal(secretFromTotpUri(uri), 'JBSWY3DPEHPK3PXP');
  assert.equal(groupSecret('JBSWY3DPEHPK3PXP'), 'JBSW Y3DP EHPK 3PXP');
  assert.equal(groupSecret('ABCDEF'), 'ABCD EF');
  assert.equal(secretFromTotpUri('otpauth://totp/x?issuer=y'), null);
});

test('Retry-After is read as seconds or as a date', () => {
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter('120'), 120);
  assert.equal(parseRetryAfter('soon'), null);
  const now = Date.parse('2026-11-12T10:00:00Z');
  assert.equal(parseRetryAfter('Thu, 12 Nov 2026 10:05:00 GMT', now), 300);
  assert.equal(parseRetryAfter('Thu, 12 Nov 2026 09:00:00 GMT', now), 0);
});

test('a wrong password never says which part was wrong', () => {
  assert.equal(authErrorMessage('invalid_credentials'), 'wrong username, email or password.');
});

test('rate limiting names the wait when the server gave one', () => {
  assert.match(authErrorMessage('rate_limited', 30), /a minute/);
  assert.match(authErrorMessage('rate_limited', 600), /10 minutes/);
  assert.match(authErrorMessage('rate_limited', null), /wait a while/);
});

test('every contract code has its own line, and an unknown one a fallback', () => {
  const fallback = authErrorMessage('no_such_code');
  const codes = [
    'invalid_credentials', 'account_disabled', 'bad_request', 'origin', 'unavailable',
    'invalid_code', 'no_challenge', 'no_session', 'two_factor_required', 'wrong_password',
    'weak_password', 'try_again', 'invalid_token', 'forbidden', 'unknown_member', 'not_enabled',
    'already_enrolled', 'not_found', 'internal', NETWORK_ERROR, FIREBASE_REFUSED,
  ];
  for (const code of codes) {
    const line = authErrorMessage(code);
    assert.notEqual(line, fallback, code);
    assert.equal(line, line.toLowerCase(), code);
  }
});

test('the old login page is offered only when the new one cannot answer', () => {
  assert.equal(isUnavailableCode('unavailable'), true);
  assert.equal(isUnavailableCode(NETWORK_ERROR), true);
  assert.equal(isUnavailableCode('invalid_credentials'), false);
  assert.equal(isUnavailableCode('rate_limited'), false);
});

test("the server's sentence is shown only for the codes asked for, and only when usable", () => {
  const sentence = 'Could not reach the sign-in service. Nothing changed; try again.';
  assert.equal(memberErrorText('try_again', null, sentence, ['try_again', 'unavailable']), sentence);
  assert.equal(memberErrorText('try_again', null, `  ${sentence}  `, ['try_again']), sentence);
  assert.equal(memberErrorText('try_again', null, sentence), authErrorMessage('try_again'));
  assert.equal(memberErrorText('wrong_password', null, sentence, ['try_again']), authErrorMessage('wrong_password'));
  assert.equal(memberErrorText('unavailable', null, null, ['unavailable']), authErrorMessage('unavailable'));
  assert.equal(memberErrorText('unavailable', null, '   ', ['unavailable']), authErrorMessage('unavailable'));
  assert.equal(memberErrorText('unavailable', null, 42, ['unavailable']), authErrorMessage('unavailable'));
  assert.equal(memberErrorText('unavailable', null, 'x'.repeat(201), ['unavailable']), authErrorMessage('unavailable'));
  assert.match(memberErrorText('rate_limited', 600, sentence), /10 minutes/);
});

test('losing the Firebase user starts a renewal only with the marker, no user, nothing running, past the cooldown', () => {
  const base = { markerSet: true, hasUser: false, inFlight: false, msSinceLastAttempt: RENEW_COOLDOWN_MS };
  assert.equal(shouldRenewAfterLoss(base), true);
  assert.equal(shouldRenewAfterLoss({ ...base, msSinceLastAttempt: Date.now() }), true);
  assert.equal(shouldRenewAfterLoss({ ...base, markerSet: false }), false);
  assert.equal(shouldRenewAfterLoss({ ...base, hasUser: true }), false);
  assert.equal(shouldRenewAfterLoss({ ...base, inFlight: true }), false);
  assert.equal(shouldRenewAfterLoss({ ...base, msSinceLastAttempt: RENEW_COOLDOWN_MS - 1 }), false);
});

test('a renewed token is used only if nobody signed out or in meanwhile', () => {
  const base = { markerSet: true, epochAtStart: 3, epochNow: 3, uidAtStart: null, uidNow: null };
  assert.equal(mayUseRenewedToken(base), true);
  assert.equal(mayUseRenewedToken({ ...base, uidAtStart: 'u1', uidNow: 'u1' }), true);
  // Marker gone: another tab signed out.
  assert.equal(mayUseRenewedToken({ ...base, markerSet: false }), false);
  // Epoch moved: this tab signed out, even if a new sign-in set the marker again.
  assert.equal(mayUseRenewedToken({ ...base, epochNow: 4 }), false);
  // Someone signed in meanwhile, or the user changed.
  assert.equal(mayUseRenewedToken({ ...base, uidNow: 'u2' }), false);
  assert.equal(mayUseRenewedToken({ ...base, uidAtStart: 'u1', uidNow: 'u2' }), false);
  assert.equal(mayUseRenewedToken({ ...base, uidAtStart: 'u1', uidNow: null }), false);
});

test('a dropped connection during the token exchange is transient; anything else is a refusal', () => {
  assert.equal(firebaseExchangeFailure('auth/network-request-failed'), NETWORK_ERROR);
  assert.equal(firebaseExchangeFailure('auth/too-many-requests'), NETWORK_ERROR);
  assert.equal(firebaseExchangeFailure('auth/user-disabled'), FIREBASE_REFUSED);
  assert.equal(firebaseExchangeFailure('auth/invalid-custom-token'), FIREBASE_REFUSED);
  assert.equal(firebaseExchangeFailure(undefined), FIREBASE_REFUSED);
});

test('a failed renewal forgets the sign-in only when the server has no usable session', () => {
  assert.equal(renewFailureAction('no_session'), 'forget');
  assert.equal(renewFailureAction('two_factor_required'), 'forget');
  assert.equal(renewFailureAction(FIREBASE_REFUSED), 'end');
  for (const code of [NETWORK_ERROR, 'unavailable', 'try_again', 'internal', 'rate_limited', 'origin', 'unknown']) {
    assert.equal(renewFailureAction(code), 'keep', code);
  }
});
