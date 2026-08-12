import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { ensureJoinedAt } from './userCache';

/** Stamps a join date on the signed-in user's profile the first time they log
    in without one. Mount this once, at the app root — it listens for the auth
    state rather than hanging off a route, so it fires on sign-in and on a
    restored session, but not again on every navigation. */
export function useJoinDate(): void {
  useEffect(() => onAuthStateChanged(auth, (user) => {
    if (user) void ensureJoinedAt(user);
  }), []);
}
