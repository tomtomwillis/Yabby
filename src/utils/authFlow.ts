/* The pure parts of the self-hosted sign-in: no network, no Firebase, so the
   unit tests can import this file directly. */

/** The client's own code for a request that never got an answer. */
export const NETWORK_ERROR = 'network';
/** The client's own code for a custom token Firebase would not exchange. */
export const FIREBASE_REFUSED = 'firebase_refused';

export type SignInMethod = 'email' | 'username';

/** The server reads an identifier with an `@` as an email, so the event does too. */
export function signInMethod(identifier: string): SignInMethod {
  return identifier.includes('@') ? 'email' : 'username';
}

const MAX_TOKEN_LENGTH = 512;

/** The reset token from a `#token=…` fragment, or null when there is none. */
export function tokenFromHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const token = new URLSearchParams(raw).get('token')?.trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}

/** The base32 secret inside an `otpauth://` URI, for typing in by hand. */
export function secretFromTotpUri(uri: string): string | null {
  const match = /[?&]secret=([^&#]+)/i.exec(uri);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]).toUpperCase();
  } catch {
    return null;
  }
}

/** Groups of four, the way authenticator apps print a secret. */
export function groupSecret(secret: string): string {
  return secret.replace(/\s+/g, '').match(/.{1,4}/g)?.join(' ') ?? '';
}

/** Seconds to wait from a `Retry-After` header (seconds or an HTTP date). */
export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

function formatWait(seconds: number): string {
  if (seconds <= 60) return 'a minute';
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minutes`;
}

/** Codes after which the old login page is the way in. */
export function isUnavailableCode(code: string): boolean {
  return code === 'unavailable' || code === NETWORK_ERROR;
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'wrong username, email or password.',
  account_disabled: 'this account is switched off — ask an admin.',
  bad_request: 'that did not look right — check it and try again.',
  origin: 'sign-in is not allowed from this address.',
  unavailable: 'sign-in is unavailable right now.',
  [NETWORK_ERROR]: 'could not reach the server — check your connection and try again.',
  invalid_code: 'that code did not work — try again.',
  no_challenge: 'that took too long — sign in again.',
  no_session: 'your session has ended — sign in again.',
  two_factor_required: 'two-step sign-in is required for this account.',
  wrong_password: 'wrong password.',
  weak_password: 'pick a longer or less common password (10 or more characters).',
  try_again: 'that did not go through — try again.',
  invalid_token: 'this reset link is invalid, used or expired — ask an admin for a new one.',
  forbidden: 'only admins with two-step sign-in on can make reset links.',
  unknown_member: 'no member with that username or email.',
  not_enabled: 'that member is not on the new sign-in yet.',
  [FIREBASE_REFUSED]: 'sign-in failed — try again, or ask an admin.',
};

/** A short line in the site's voice for an error code from the auth API. */
export function authErrorMessage(code: string, retryAfterSeconds: number | null = null): string {
  if (code === 'rate_limited') {
    return retryAfterSeconds
      ? `too many attempts — try again in ${formatWait(retryAfterSeconds)}.`
      : 'too many attempts — wait a while before trying again.';
  }
  return MESSAGES[code] ?? 'something went wrong — try again.';
}

/** A reset link's expiry for display. Accepts ISO text or epoch (s or ms). */
export function formatExpiry(expiresAt: string | number): string {
  const ms = typeof expiresAt === 'number' && expiresAt < 1e12 ? expiresAt * 1000 : expiresAt;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
