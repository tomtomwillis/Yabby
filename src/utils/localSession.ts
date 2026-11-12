import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { AuthApiError, getSession, signOutLocal, type LocalSession } from '../api/auth';

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
  setMarker(false);
  setState({ status: 'none' });
}

/** The server says the session is gone: sign this browser out to match. */
export async function localSessionEnded(): Promise<void> {
  clearLocalSignIn();
  await signOut(auth);
}

/** Best-effort server sign-out, then forget the marker. Firebase is left to the caller. */
export async function endLocalSession(): Promise<void> {
  try {
    await signOutLocal();
  } catch {
    // Signing out of Firebase still goes ahead.
  }
  clearLocalSignIn();
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
        await endLocalSession();
        await signOut(auth);
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
      } else if (hasLocalSignIn()) {
        // Signed out some other way (another tab, revoked refresh token):
        // the server session should not outlive it.
        void endLocalSession();
      } else {
        setState({ status: 'none' });
      }
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
