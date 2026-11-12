import { authErrorMessage, memberErrorText, NETWORK_ERROR, parseRetryAfter } from '../utils/authFlow';

/* The self-hosted sign-in (`/api/auth`). Plain fetch rather than authedFetch:
   these calls are what produce a Firebase user, so most run without one, and
   the session rides on an HttpOnly cookie, never a header. Bodies carry
   passwords and codes, so nothing here logs a request or a response. */

const BASE = '/api/auth';

export class AuthApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Seconds, from `Retry-After`, on a 429. */
  readonly retryAfter: number | null;
  /** The server's `error` sentence, when it sent one. */
  readonly serverText: string | null;

  constructor(status: number, code: string, retryAfter: number | null = null, serverText: string | null = null) {
    super(`auth request failed: ${status} ${code}`);
    this.name = 'AuthApiError';
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
    this.serverText = serverText;
  }
}

/**
 * The code and the member-facing line for anything a call here threw. For the
 * codes in `preferServerFor` the server's own sentence is shown when it sent one.
 */
export function describeAuthError(
  err: unknown,
  preferServerFor: readonly string[] = [],
): { code: string; text: string } {
  if (!(err instanceof AuthApiError)) return { code: NETWORK_ERROR, text: authErrorMessage(NETWORK_ERROR) };
  return { code: err.code, text: memberErrorText(err.code, err.retryAfter, err.serverText, preferServerFor) };
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: Record<string, string>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new AuthApiError(0, NETWORK_ERROR);
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // A proxy's HTML error page, or an empty body.
  }

  if (!response.ok) {
    const code = typeof (data as { code?: unknown })?.code === 'string'
      ? (data as { code: string }).code
      : response.status >= 500 ? 'unavailable' : 'unknown';
    const sentence = (data as { error?: unknown })?.error;
    throw new AuthApiError(
      response.status,
      code,
      parseRetryAfter(response.headers.get('Retry-After')),
      typeof sentence === 'string' ? sentence : null,
    );
  }
  if (data === null) throw new AuthApiError(response.status, 'unavailable');
  return data as T;
}

export type SignInResult =
  | { status: 'ok'; firebaseToken: string; uid: string }
  | { status: 'two_factor' }
  | { status: 'enrol_two_factor'; uid: string };

export interface LocalSession {
  uid: string;
  twoFactorEnabled: boolean;
  twoFactorRequired: boolean;
  canIssueResetLinks: boolean;
}

export interface TwoFactorEnrolment {
  totpUri: string;
  backupCodes: string[];
}

export interface ResetLink {
  url: string;
  expiresAt: string | number;
}

export const signIn = (identifier: string, password: string) =>
  call<SignInResult>('POST', '/sign-in', { identifier, password });

export const verifyTwoFactor = (answer: { code: string } | { backupCode: string }) =>
  call<{ status: 'ok'; firebaseToken: string; uid: string }>('POST', '/two-factor/verify', answer);

export const getSession = () => call<LocalSession>('GET', '/session');

export const getFirebaseToken = () => call<{ firebaseToken: string }>('POST', '/firebase-token');

export const signOutLocal = () => call<{ ok: true }>('POST', '/sign-out');

export const changePassword = (currentPassword: string, newPassword: string) =>
  call<{ ok: true }>('POST', '/password', { currentPassword, newPassword });

export const enrolTwoFactor = (password: string) =>
  call<TwoFactorEnrolment>('POST', '/two-factor/enrol', { password });

export const confirmTwoFactor = (code: string) =>
  call<{ ok: true; firebaseToken: string }>('POST', '/two-factor/confirm', { code });

export const disableTwoFactor = (password: string) =>
  call<{ ok: true }>('POST', '/two-factor/disable', { password });

export const issueResetLink = (identifier: string) =>
  call<ResetLink>('POST', '/admin/reset-link', { identifier });

export const resetPassword = (token: string, newPassword: string) =>
  call<{ ok: true }>('POST', '/reset', { token, newPassword });
