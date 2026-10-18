import { useEffect, useState } from 'react';
import { onIdTokenChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig';

// The music proxy authorises <img> and <audio> by an HttpOnly cookie, since
// neither can send a header. It is minted from the Firebase token here and
// re-minted whenever that token refreshes, so it outlives no sign-in.

const SESSION_URL = '/api/music/session';
const LOGOUT_URL = '/api/music/logout';
// Well inside the server's 12 h, for a tab left open with no token refresh.
const REMINT_AFTER_MS = 6 * 60 * 60 * 1000;
// The app must not hang on music: past this, pages render and covers fail.
const READY_TIMEOUT_MS = 8000;

let mintedAt = 0;
let settle: (() => void) | null = null;
let ready = new Promise<void>((resolve) => { settle = resolve; });
let isReady = false;
const listeners = new Set<() => void>();

function markReady() {
  if (isReady) return;
  isReady = true;
  settle?.();
  listeners.forEach((listener) => listener());
}

async function mint(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const response = await fetch(SESSION_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    });
    if (response.ok) mintedAt = Date.now();
    else console.error('Music session refused:', response.status);
  } catch (err) {
    console.error('Music session failed:', err);
  }
}

onIdTokenChanged(auth, (user) => {
  if (user) {
    void mint().finally(markReady);
  } else {
    mintedAt = 0;
    void fetch(LOGOUT_URL, { method: 'POST' }).catch(() => undefined);
    // Signed out: nothing to wait for, and the next sign-in waits afresh.
    if (isReady) {
      isReady = false;
      ready = new Promise<void>((resolve) => { settle = resolve; });
    }
  }
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && mintedAt && Date.now() - mintedAt > REMINT_AFTER_MS) void mint();
  });
}

// Responses cached before the proxy were keyed by URLs carrying the shared
// account's credentials.
if (typeof caches !== 'undefined') void caches.delete('api-cache').catch(() => undefined);

/** Resolves once the music cookie is set (or could not be, after a timeout). */
export function musicSessionReady(): Promise<void> {
  return Promise.race([ready, new Promise<void>((resolve) => setTimeout(resolve, READY_TIMEOUT_MS))]);
}

/** True once a signed-in page may load covers and audio. */
export function useMusicSessionReady(): boolean {
  const [state, setState] = useState(isReady);
  useEffect(() => {
    const update = () => setState(isReady);
    listeners.add(update);
    update();
    const timer = setTimeout(() => setState(true), READY_TIMEOUT_MS);
    return () => {
      listeners.delete(update);
      clearTimeout(timer);
    };
  }, []);
  return state;
}
