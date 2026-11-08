import { collection, query, where, orderBy, limit, doc } from 'firebase/firestore';
import { trackedGetDoc as getDoc, trackedGetDocs as getDocs } from '../utils/firestoreMetrics';
import { db, auth } from '../firebaseConfig';
import { fetchSubsonicJson } from '../utils/navidrome';
import { apiRequest, ApiError } from '../api/client';

/**
 * Fast read-only checks that run when the test page loads. Between them they
 * cover everything the site needs to work at all, so a red pill here explains
 * most "the site is broken" reports without running a full suite.
 */

const MEDIA_API_URL = import.meta.env.VITE_MEDIA_API_URL || '/api/media';

export interface QuickCheck {
  name: string;
  /** Return a short line of detail. Throw to fail. */
  run: () => Promise<string>;
}

export const quickChecks: QuickCheck[] = [
  {
    name: 'Signed in',
    run: async () => {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in. Everything below will fail.');
      return `${user.email ?? user.uid}`;
    },
  },
  {
    name: 'Your profile',
    run: async () => {
      const user = auth.currentUser;
      if (!user) throw new Error('Not signed in.');
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists()) throw new Error('No profile document. You cannot post anything without one.');
      const username = snap.data().username;
      if (!username) throw new Error('Profile has no username. Posting will be rejected.');
      return `posting as ${username}`;
    },
  },
  {
    name: 'Firestore',
    run: async () => {
      const snap = await getDocs(query(collection(db, 'stickers'), limit(1)));
      if (snap.empty) throw new Error('Read worked but no stickers exist.');
      return 'database reachable, reads allowed';
    },
  },
  {
    name: 'Message board',
    run: async () => {
      const snap = await getDocs(
        query(collection(db, 'messages'), orderBy('lastActivityAt', 'desc'), limit(1)),
      );
      if (snap.empty) throw new Error('No messages came back. The board will look empty.');
      return 'board query works';
    },
  },
  {
    name: 'Lists index',
    run: async () => {
      // The Lists page needs a composite index for this. When it is missing the
      // page shows nothing and only the console explains why.
      await getDocs(
        query(
          collection(db, 'lists'),
          where('isPublic', '==', true),
          orderBy('lastUpdated', 'desc'),
          limit(1),
        ),
      );
      return 'composite index is live';
    },
  },
  {
    name: 'Navidrome',
    run: async () => {
      // Returns the subsonic-response object and throws on API errors already.
      const root = await fetchSubsonicJson('ping');
      if (root?.status !== 'ok') throw new Error(`Music server replied "${root?.status ?? 'nothing'}".`);
      return 'music server responding';
    },
  },
  {
    name: 'Backend API',
    run: async () => {
      const response = await fetch(`${MEDIA_API_URL}/health`);
      // A 429 still proves the server is alive. Re-checking a few times in a
      // row trips its own rate limiter, which is not a fault worth flagging.
      if (response.status === 429) return 'up, currently rate limiting you';
      if (!response.ok) throw new Error(`Health check returned ${response.status}.`);
      const data = await response.json();
      if (data?.status !== 'ok') throw new Error('Health check did not report ok.');
      return 'uploads and travel API up';
    },
  },
  {
    name: 'Data store',
    run: async () => {
      // Where each moved area reads from, and whether the write-back queue is
      // keeping up. An admin also writes, reads and deletes one scratch row.
      const { sources } = await apiRequest<{ sources: Record<string, string> }>('GET', '/source');
      const { writeback } = await apiRequest<{ writeback: { pending: number; stuck: boolean } }>('GET', '/health');
      if (writeback.stuck) throw new Error(`Write-back is stuck with ${writeback.pending} change(s) waiting for Firestore.`);
      const result = await apiRequest<{ ok: boolean; ms: number }>('POST', '/selftest').catch((err) => {
        if (err instanceof ApiError && err.status === 403) return null;
        throw err;
      });
      if (result && !result.ok) throw new Error('The scratch row did not come back.');
      const selftest = result ? `scratch write ok in ${result.ms} ms` : 'scratch write needs an admin';
      const moved = Object.entries(sources).filter(([, source]) => source === 'sqlite').map(([area]) => area);
      return `${moved.length ? `on SQLite: ${moved.join(', ')}` : 'every area on Firestore'}; ${writeback.pending} queued; ${selftest}`;
    },
  },
  {
    name: 'Sandbox rules',
    run: async () => {
      try {
        await getDocs(query(collection(db, 'testMessages'), limit(1)));
      } catch (err) {
        if ((err as { code?: string }).code === 'permission-denied') {
          throw new Error('Not deployed. Run: firebase deploy --only firestore:rules,firestore:indexes');
        }
        throw err;
      }
      return 'test collections readable';
    },
  },
];
