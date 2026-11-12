import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithCustomToken, signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { AuthApiError, getFirebaseToken, getSession, signOutLocal, type LocalSession } from '../api/auth';
import {
  firebaseExchangeFailure,
  mayUseRenewedToken,
  NETWORK_ERROR,
  renewFailureAction,
  shouldRenewAfterLoss,
} from './authFlow';

/* The backend session behind the self-hosted sign-in. Firebase keeps the
   browser signed in on its own, so without this check revoking a session on
   the server would change nothing here. Members who used the old login page
   never get the marker and so never cause a request to /api/auth. */

export type LocalSessionState =
  | { status: 'unknown' }
  | { status: 'none' }
  | { status: 'active'; session: LocalSession };

// Not a secret: it only says which sign-in this browser used.
const MARKER_KEY = 'yv-signin';
const MARKER_VALUE = 'local';
const RECHECK_AFTER_MS = 15 * 60 * 1000;

let state: LocalSessionState = { status: 'unknown' };
let lastAttemptAt = 0;
let inflight: Promise<void> | null = null;
let renewing: Promise<void> | null = null;
let lastRenewAt = 0;
// Bumped whenever the marker is cleared, so a renewal that started before a
// sign-out can tell and must not sign the browser back in.
let signOutEpoch = 0;
const listeners = new Set<() => void>();

function setState(next: LocalSessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function hasLocalSignIn(): boolean {
  try {
    return localStorage.getItem(MARKER_KEY) === MARKER_VALUE;
  } catch {
    return false;
  }
}

function setMarker(on: boolean) {
  try {
    if (on) localStorage.setItem(MARKER_KEY, MARKER_VALUE);
    else localStorage.removeItem(MARKER_KEY);
  } catch {
    // Without storage the session is simply not watched.
  }
}

/** Forget the local sign-in without touching Firebase. */
export function clearLocalSignIn(): void {
  signOutEpoch += 1;
  setMarker(false);
  setState({ status: 'none' });
}

/** The server says the session is gone: sign this browser out to match. */
export async function localSessionEnded(): Promise<void> {
  clearLocalSignIn();
  await signOut(auth);
}

/** Forget the marker, then a best-effort server sign-out. Firebase is left to the caller. */
async function endLocalSession(): Promise<void> {
  // The marker goes first: every tab reads it before trying to renew a lost
  // Firebase session, and the server sign-out can take a while.
  clearLocalSignIn();
  try {
    await signOutLocal();
  } catch {
    // Signing out of Firebase still goes ahead.
  }
}

/**
 * A deliberate sign-out. The marker and the server session go before
 * Firebase does, so neither this tab nor another one renews it: they find no
 * marker, and a renewal already under way gets `no_session` or sees the
 * marker gone.
 */
export async function signOutEverywhere(): Promise<void> {
  if (hasLocalSignIn()) await endLocalSession();
  else clearLocalSignIn();
  await signOut(auth);
}

/** A failure code, or null when there is nothing more to do. */
async function exchangeForFirebase(
  given: string | undefined,
  epochAtStart: number,
  uidAtStart: string | null,
): Promise<string | null> {
  let token = given;
  if (!token) {
    try {
      token = (await getFirebaseToken()).firebaseToken;
    } catch (err) {
      return err instanceof AuthApiError ? err.code : NETWORK_ERROR;
    }
  }
  const usable = mayUseRenewedToken({
    markerSet: hasLocalSignIn(),
    epochAtStart,
    epochNow: signOutEpoch,
    uidAtStart,
    uidNow: auth.currentUser?.uid ?? null,
  });
  if (!usable) return null;
  try {
    await signInWithCustomToken(auth, token);
  } catch (err) {
    return firebaseExchangeFailure((err as { code?: unknown } | null)?.code);
  }
  // A sign-out that landed during the exchange wins.
  if (!hasLocalSignIn() || signOutEpoch !== epochAtStart) await signOut(auth);
  return null;
}

/**
 * Replace the Firebase session with one from the backend session: with the
 * token a call just returned, or a fresh one from /firebase-token. The backend
 * changes the member's Firebase password in several flows, and Firebase then
 * ends every session it had issued.
 */
export function renewFirebaseSession(firebaseToken?: string): Promise<void> {
  if (renewing) return renewing;
  lastRenewAt = Date.now();
  const epochAtStart = signOutEpoch;
  const uidAtStart = auth.currentUser?.uid ?? null;

  renewing = (async () => {
    try {
      const failure = await exchangeForFirebase(firebaseToken, epochAtStart, uidAtStart);
      if (failure === null || signOutEpoch !== epochAtStart) return;
      const action = renewFailureAction(failure);
      if (action === 'forget') {
        await localSessionEnded();
      } else if (action === 'end') {
        await endLocalSession();
        await signOut(auth);
      }
    } catch {
      // Firebase's own sign-out failing leaves nothing better to do here.
    } finally {
      renewing = null;
    }
  })();
  return renewing;
}

/** Ask the server about the session now. A network error or 5xx keeps the member signed in. */
export function refreshLocalSession(): Promise<void> {
  const user = auth.currentUser;
  if (!user || !hasLocalSignIn()) {
    setState({ status: 'none' });
    return Promise.resolve();
  }
  if (inflight) return inflight;

  inflight = (async () => {
    lastAttemptAt = Date.now();
    try {
      // A browser left with a stale marker that then used the old login page
      // must not be signed out by a session it never had.
      const { signInProvider } = await user.getIdTokenResult();
      if (signInProvider !== 'custom') {
        clearLocalSignIn();
        return;
      }
      const session = await getSession();
      if (auth.currentUser?.uid !== user.uid) return;
      if (session.uid !== user.uid) {
        await signOutEverywhere();
        return;
      }
      setState({ status: 'active', session });
    } catch (err) {
      if (err instanceof AuthApiError && err.code === 'no_session') await localSessionEnded();
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Called once a new sign-in has a Firebase user. */
export function markLocalSignIn(): void {
  setMarker(true);
  void refreshLocalSession();
}

/** Watches the Firebase user and the tab. Mount once, at the app root. */
export function useLocalSessionWatch(): void {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        void refreshLocalSession();
        return;
      }
      setState({ status: 'none' });
      // With the marker still set, nobody signed out on purpose (that clears
      // it first): Firebase dropped the session, usually because its refresh
      // token was revoked, and the backend session may well still be good.
      const renew = shouldRenewAfterLoss({
        markerSet: hasLocalSignIn(),
        hasUser: auth.currentUser !== null,
        inFlight: renewing !== null,
        msSinceLastAttempt: Date.now() - lastRenewAt,
      });
      if (renew) void renewFirebaseSession();
    });

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!hasLocalSignIn() || !auth.currentUser) return;
      if (Date.now() - lastAttemptAt >= RECHECK_AFTER_MS) void refreshLocalSession();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

export function useLocalSession(): LocalSessionState {
  const [current, setCurrent] = useState(state);
  useEffect(() => {
    const update = () => setCurrent(state);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return current;
}
