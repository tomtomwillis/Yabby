/**
 * Differential test: backend_server/data/policy.js against the real
 * firestore.rules, in the Firestore emulator.
 *
 *   npm run test:policy
 *
 * Needs Java (for the emulator), the Firebase CLI, and the backend's
 * dependencies installed (`cd backend_server && npm ci`) for better-sqlite3.
 * Runs entirely against a demo project in the emulator — no real Firestore,
 * no reads billed.
 *
 * ## Why
 *
 * The shadow write path judges every real write with policy.js in log-only
 * mode, but real members almost never attempt a hostile write, so months of
 * clean traffic say little about whether the port is too *loose*. This does
 * the attempting: every valid write below is replayed against both sides, then
 * mutated — keys dropped, added and retyped, strings stretched, timestamps
 * moved, counts pushed past ±1, ownership swapped, the caller changed — and
 * every mutation is judged by both. Any disagreement fails the test.
 *
 * ## What is compared
 *
 * The policy side is not policy.js called bare. Each write goes through the
 * shadow's own processReport against an in-memory SQLite seeded with the same
 * documents, so `before` is the rebuilt row, the patch is replayed with the
 * shadow's own transform and merge logic, and the lookups come from the real
 * policyContext. That is the whole pipeline Phase E will enforce with.
 * processReport is called with firestoreOk:false, so nothing it judges is
 * stored and the seed stays put between cases.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  doc, setDoc, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, increment, arrayUnion, arrayRemove, deleteField, Timestamp,
} from 'firebase/firestore';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

process.env.DATA_DB_PATH = ':memory:';
process.env.AUDIT_LOG_DIR = path.join(here, '.audit-unused');

const require = createRequire(import.meta.url);
const { initDataDb, closeDataDb } = require('../../backend_server/data/db');
const { parsePath, processReport, applyWrite } = require('../../backend_server/data/shadow');

// ---------------------------------------------------------------------------
// Vocabulary — the same markers src/api/shadow.ts uses
// ---------------------------------------------------------------------------

const SERVER_TIME = { __op: 'serverTime' };
const DELETE_FIELD = { __op: 'deleteField' };
const incrementBy = (by) => ({ __op: 'increment', by });
const arrayUnionOf = (...values) => ({ __op: 'arrayUnion', values });
const arrayRemoveOf = (...values) => ({ __op: 'arrayRemove', values });
/** A literal timestamp `offset` ms from the start of the run. */
const at = (offset) => ({ __at: offset });

const T0 = Date.now();

const ALICE = 'uid-alice';
const BOB = 'uid-bob';
const CAROL = 'uid-carol';
const ADMIN = 'uid-admin';

const isMarker = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && '__op' in value;
const isAt = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && '__at' in value;
const isMap = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && !isMarker(value) && !isAt(value);

/** Marker form → what the emulator is handed. */
function forEmulator(value) {
  if (isAt(value)) return Timestamp.fromMillis(T0 + value.__at);
  if (isMarker(value)) {
    switch (value.__op) {
      case 'serverTime': return serverTimestamp();
      case 'deleteField': return deleteField();
      case 'increment': return increment(value.by);
      case 'arrayUnion': return arrayUnion(...value.values);
      case 'arrayRemove': return arrayRemove(...value.values);
      default: throw new Error(`unknown marker ${value.__op}`);
    }
  }
  if (Array.isArray(value)) return value.map(forEmulator);
  if (isMap(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, forEmulator(v)]));
  return value;
}

/** Marker form → what the browser reports to the shadow (see forShadow). */
function forReport(value) {
  if (isAt(value)) {
    const ms = T0 + value.__at;
    return { __t: 'ts', ms, iso: new Date(ms).toISOString() };
  }
  if (isMarker(value)) return value;
  if (Array.isArray(value)) return value.map(forReport);
  if (isMap(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, forReport(v)]));
  return value;
}

// ---------------------------------------------------------------------------
// The world both sides start from
// ---------------------------------------------------------------------------

const post = (userId, username, extra = {}) => ({
  text: 'hello', userId, username, avatar: '', timestamp: at(-60_000), lastActivityAt: at(-60_000),
  reactedBy: [BOB], reactionCount: 1, replyCount: 1, ...extra,
});
const reply = (userId, username) => ({
  text: 'a reply', userId, username, avatar: '', timestamp: at(-30_000), reactedBy: [], reactionCount: 0,
});
const film = { tmdbId: 42, title: 'Film', releaseYear: '1999', posterPath: null, overview: 'o', pitch: 'p', submittedByUsername: 'alice' };

const SEED = {
  'admins/uid-admin': { name: 'admin' },
  'users/uid-alice': { username: 'alice', avatar: '/a.webp', bio: 'hi', postCount: 3, joinedAt: at(-86_400_000) },
  'users/uid-bob': { username: 'bob', avatar: '', postCount: 0 },
  'users/uid-admin': { username: 'admin', avatar: '' },
  'usernames/alice': { uid: ALICE, username: 'alice' },
  'usernames/bob': { uid: BOB, username: 'bob' },
  'usernames/admin': { uid: ADMIN, username: 'admin' },
  'usernames/carol': { uid: CAROL, username: 'carol' },

  'messages/m1': post(ALICE, 'alice'),
  'messages/poll': post(ALICE, 'alice', { pollQuestion: 'which?', pollOptions: ['a', 'b', 'c'], pollMultiple: false, pollVotes: { [BOB]: [0] } }),
  'messages/m1/replies/r1': reply(BOB, 'bob'),
  'testMessages/t1': post(ALICE, 'alice'),
  'filmClubMessages/f1': post(ALICE, 'alice', { showOnMain: false }),
  'filmClubMessages/f1/replies/r1': reply(BOB, 'bob'),
  'issues/i1': post(ALICE, 'alice', { status: 'inprogress' }),
  'issues/i1/replies/r1': reply(BOB, 'bob'),
  'news/n1': post(ADMIN, 'admin', { showOnMain: true }),
  'news/n1/replies/r1': reply(BOB, 'bob'),

  'lists/own': { title: 'mine', userId: ALICE, username: 'alice', timestamp: at(-1000), itemCount: 1, isPublic: true, isCollaborative: false, lastUpdated: at(-1000) },
  'lists/collab': { title: 'shared', userId: BOB, username: 'bob', timestamp: at(-1000), itemCount: 0, isPublic: true, isCollaborative: true, lastUpdated: at(-1000) },
  'lists/own/items/it1': { type: 'custom', userText: 'note', order: 0, title: 'thing', timestamp: at(-1000) },

  'stickers/s1': { userId: ALICE, albumId: 'alb', text: 'nice', position: { x: 1, y: 2 }, sticker: '/s.webp', timestamp: at(-1000) },

  'filmClub/2026-09': { currentFilm: { title: 'x' }, downloadLinks: [] },
  'filmClub/2026-10': { currentFilm: { title: 'y' } },
  'filmClub/2026-09/submissions/uid-alice_42': { userId: ALICE, username: 'alice', title: 'Film', releaseYear: '1999', posterPath: null, overview: '', pitch: '', tmdbId: 42, timestamp: at(-1000) },
  'filmClub/2026-09/votes/uid-alice': { ranking: ['uid-alice_42'], updatedAt: at(-1000) },

  'wiki/content': { text: 'the wiki', updatedBy: ADMIN, updatedAt: at(-1000) },
  'cinema/state': { nextShowingAt: '2026-10-01T20:00' },
};

// ---------------------------------------------------------------------------
// Valid writes — every one should be allowed by both sides
// ---------------------------------------------------------------------------

const newPost = (extra = {}) => ({
  text: 'new post', userId: ALICE, username: 'alice', avatar: '', timestamp: SERVER_TIME, lastActivityAt: SERVER_TIME,
  reactedBy: [], reactionCount: 0, ...extra,
});
const newReply = (extra = {}) => ({
  text: 'new reply', userId: ALICE, username: 'alice', avatar: '', timestamp: SERVER_TIME, reactedBy: [], reactionCount: 0, ...extra,
});

const BASES = [
  // Boards
  { name: 'post', as: ALICE, op: 'create', path: 'messages/new', data: newPost() },
  { name: 'post with poll', as: ALICE, op: 'create', path: 'messages/newpoll', data: newPost({ pollQuestion: 'q?', pollOptions: ['x', 'y'], pollMultiple: true, pollVotes: {} }) },
  { name: 'post with image', as: ALICE, op: 'create', path: 'messages/newimg', data: newPost({ text: '', imageId: 'i'.repeat(36) }) },
  { name: 'bot post', as: ADMIN, op: 'create', path: 'messages/bot', data: newPost({ userId: ADMIN, username: 'Film Club Bot', isBot: true }) },
  { name: 'sandbox post', as: ALICE, op: 'create', path: 'testMessages/new', data: newPost() },
  { name: 'post edit', as: ALICE, op: 'update', path: 'messages/m1', data: { text: 'edited', editedAt: SERVER_TIME } },
  { name: 'reaction add', as: ALICE, op: 'update', path: 'messages/m1', data: { reactedBy: arrayUnionOf(ALICE), reactionCount: incrementBy(1) } },
  { name: 'reaction remove', as: BOB, op: 'update', path: 'messages/m1', data: { reactedBy: arrayRemoveOf(BOB), reactionCount: incrementBy(-1) } },
  { name: 'reply bump', as: BOB, op: 'update', path: 'messages/m1', data: { lastActivityAt: SERVER_TIME, replyCount: incrementBy(1) } },
  { name: 'reply unbump', as: BOB, op: 'update', path: 'messages/m1', data: { replyCount: incrementBy(-1) } },
  { name: 'poll vote', as: ALICE, op: 'update', path: 'messages/poll', data: { [`pollVotes.${ALICE}`]: [1] } },
  { name: 'poll revote', as: BOB, op: 'update', path: 'messages/poll', data: { [`pollVotes.${BOB}`]: [2] } },
  { name: 'post delete', as: ALICE, op: 'delete', path: 'messages/m1' },
  { name: 'post delete by admin', as: ADMIN, op: 'delete', path: 'messages/m1' },
  { name: 'reply', as: ALICE, op: 'create', path: 'messages/m1/replies/new', data: newReply() },
  { name: 'reply edit', as: BOB, op: 'update', path: 'messages/m1/replies/r1', data: { text: 'edited', editedAt: SERVER_TIME } },
  { name: 'reply reaction', as: ALICE, op: 'update', path: 'messages/m1/replies/r1', data: { reactedBy: arrayUnionOf(ALICE), reactionCount: incrementBy(1) } },
  { name: 'reply delete', as: BOB, op: 'delete', path: 'messages/m1/replies/r1' },

  { name: 'film club post', as: ALICE, op: 'create', path: 'filmClubMessages/new', data: newPost({ showOnMain: true, posterUrl: 'https://p' }) },
  { name: 'film club edit', as: ALICE, op: 'update', path: 'filmClubMessages/f1', data: { text: 'edited', editedAt: SERVER_TIME } },
  { name: 'film club reaction', as: BOB, op: 'update', path: 'filmClubMessages/f1', data: { reactedBy: arrayRemoveOf(BOB), reactionCount: incrementBy(-1) } },
  { name: 'film club reply', as: ALICE, op: 'create', path: 'filmClubMessages/f1/replies/new', data: newReply() },
  { name: 'film club delete', as: ALICE, op: 'delete', path: 'filmClubMessages/f1' },

  { name: 'issue', as: ALICE, op: 'create', path: 'issues/new', data: newPost({ status: 'inprogress' }) },
  { name: 'issue resolve by poster', as: ALICE, op: 'update', path: 'issues/i1', data: { status: 'complete' } },
  { name: 'issue resolve by admin', as: ADMIN, op: 'update', path: 'issues/i1', data: { status: 'complete' } },
  { name: 'issue reply', as: BOB, op: 'create', path: 'issues/i1/replies/new', data: newReply({ userId: BOB, username: 'bob' }) },
  { name: 'issue reply bump', as: BOB, op: 'update', path: 'issues/i1', data: { lastActivityAt: SERVER_TIME, replyCount: incrementBy(1) } },

  { name: 'news post', as: ADMIN, op: 'create', path: 'news/new', data: newPost({ userId: ADMIN, username: 'admin', showOnMain: true }) },
  { name: 'news edit', as: ADMIN, op: 'update', path: 'news/n1', data: { text: 'edited', editedAt: SERVER_TIME } },
  { name: 'news reaction', as: ALICE, op: 'update', path: 'news/n1', data: { reactedBy: arrayUnionOf(ALICE), reactionCount: incrementBy(1) } },
  { name: 'news reply', as: ALICE, op: 'create', path: 'news/n1/replies/new', data: newReply() },
  { name: 'news delete', as: ADMIN, op: 'delete', path: 'news/n1' },

  // Profiles and usernames
  { name: 'profile edit', as: ALICE, op: 'set', merge: true, path: 'users/uid-alice', data: { username: 'alice', bio: 'new bio', color: 'red', locationFlag: 'NZ' } },
  { name: 'post count', as: ALICE, op: 'update', path: 'users/uid-alice', data: { postCount: incrementBy(1) } },
  { name: 'profile create', as: CAROL, op: 'set', path: 'users/uid-carol', data: { username: 'carol', avatar: '', joinedAt: at(-5000), postCount: 0 } },
  { name: 'reserve name', as: BOB, op: 'set', path: 'usernames/bobby', data: { uid: BOB, username: 'Bobby' } },
  { name: 'release name', as: ALICE, op: 'delete', path: 'usernames/alice' },
  { name: 'release unreserved name', as: ALICE, op: 'delete', path: 'usernames/nobody' },

  // Lists
  { name: 'list', as: ALICE, op: 'create', path: 'lists/new', data: { title: 'new list', userId: ALICE, username: 'alice', timestamp: SERVER_TIME, itemCount: 0, isPublic: true, isCollaborative: false, lastUpdated: SERVER_TIME } },
  { name: 'list edit', as: ALICE, op: 'update', path: 'lists/own', data: { title: 'renamed', isPublic: false, lastUpdated: SERVER_TIME } },
  { name: 'collab list edit', as: ALICE, op: 'update', path: 'lists/collab', data: { itemCount: incrementBy(1), lastUpdated: SERVER_TIME, lastItemImage: 'https://i' } },
  { name: 'list delete', as: ALICE, op: 'delete', path: 'lists/own' },
  { name: 'list item', as: ALICE, op: 'create', path: 'lists/own/items/new', data: { type: 'album', userText: '', order: 1, albumId: 'a1', albumTitle: 'T', albumArtist: 'A', albumCover: 'c', timestamp: SERVER_TIME, addedByUserId: ALICE, addedByUsername: 'alice' } },
  { name: 'collab list item', as: ALICE, op: 'create', path: 'lists/collab/items/new', data: { type: 'custom', userText: 'x', order: 1, title: 'T', linkUrl: 'https://l' } },
  { name: 'list item edit', as: ALICE, op: 'update', path: 'lists/own/items/it1', data: { userText: 'changed', order: 2 } },
  { name: 'list item delete', as: ALICE, op: 'delete', path: 'lists/own/items/it1' },

  // Stickers
  { name: 'sticker', as: ALICE, op: 'create', path: 'stickers/new', data: { userId: ALICE, albumId: 'alb', text: 'wow', position: { x: 0.5, y: 0.5 }, sticker: '/s.webp', timestamp: SERVER_TIME, albumName: 'Album' } },
  { name: 'sticker edit', as: ALICE, op: 'update', path: 'stickers/s1', data: { text: 'edited', editedAt: SERVER_TIME } },
  { name: 'sticker delete', as: ALICE, op: 'delete', path: 'stickers/s1' },

  // Film club
  { name: 'month by admin', as: ADMIN, op: 'set', merge: true, path: 'filmClub/2026-11', data: { currentFilm: film, currentFilmDescription: 'd' } },
  { name: 'month links', as: ADMIN, op: 'set', merge: true, path: 'filmClub/2026-09', data: { downloadLinks: [{ label: 'hd', url: 'https://d' }] } },
  { name: 'month clear film', as: ADMIN, op: 'update', path: 'filmClub/2026-09', data: { currentFilm: DELETE_FIELD } },
  { name: 'winner on a new month', as: BOB, op: 'set', merge: true, path: 'filmClub/2026-12', data: { nextFilm: film, winnerCalculated: true } },
  { name: 'winner on an open month', as: BOB, op: 'set', merge: true, path: 'filmClub/2026-10', data: { nextFilm: film, winnerCalculated: true } },
  { name: 'submission', as: ALICE, op: 'set', path: 'filmClub/2026-09/submissions/uid-alice_7', data: { userId: ALICE, username: 'alice', title: 'Other', releaseYear: '2001', posterPath: '/p.jpg', overview: '', pitch: 'watch it', tmdbId: 7, timestamp: SERVER_TIME } },
  { name: 'submission delete', as: ALICE, op: 'delete', path: 'filmClub/2026-09/submissions/uid-alice_42' },
  { name: 'vote', as: BOB, op: 'set', path: 'filmClub/2026-09/votes/uid-bob', data: { ranking: ['uid-alice_42'], updatedAt: SERVER_TIME } },
  { name: 'vote delete', as: ALICE, op: 'delete', path: 'filmClub/2026-09/votes/uid-alice' },

  // Admin pages
  { name: 'wiki', as: ADMIN, op: 'set', path: 'wiki/content', data: { text: 'new wiki', updatedAt: SERVER_TIME, updatedBy: ADMIN } },
  { name: 'cinema', as: ADMIN, op: 'set', merge: true, path: 'cinema/state', data: { nextShowingAt: '2026-11-01T20:00' } },
  { name: 'cinema clear', as: ADMIN, op: 'update', path: 'cinema/state', data: { nextShowingAt: DELETE_FIELD } },
];

/** Writes no one may make. Judged as-is, not mutated. */
const FORBIDDEN = [
  { name: 'place by a member', as: ALICE, op: 'set', path: 'places/N_1', data: { lat: 1, lng: 2 } },
  { name: 'contribution by a member', as: ALICE, op: 'set', path: 'places/N_1/contributions/uid-alice', data: { comment: 'x' } },
  { name: 'admin grant', as: ALICE, op: 'set', path: 'admins/uid-alice', data: {} },
  { name: 'media log', as: ADMIN, op: 'create', path: 'mediaManagerLogs/x', data: { userId: ADMIN } },
  { name: 'legacy reaction', as: ALICE, op: 'create', path: 'messages/m1/reactions/x', data: { userId: ALICE } },
  { name: 'profile delete', as: ALICE, op: 'delete', path: 'users/uid-alice' },
  { name: 'reservation rename', as: ALICE, op: 'update', path: 'usernames/alice', data: { username: 'Alice' } },
  { name: 'unknown collection', as: ALICE, op: 'set', path: 'secrets/x', data: { a: 1 } },
];

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const OTHER = { [ALICE]: BOB, [BOB]: ALICE, [CAROL]: BOB, [ADMIN]: ALICE };
const UID_FIELDS = new Set(['userId', 'uid', 'updatedBy', 'addedByUserId']);
const LENGTHS = [0, 51, 201, 501, 2001, 10_001];

function retype(value) {
  if (typeof value === 'string') return 42;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return 'true';
  if (Array.isArray(value)) return 'not a list';
  if (value === null) return 'null';
  return 'not a map';
}

function* mutationsOf(base) {
  yield { ...base, variant: 'as written' };

  for (const as of [null, OTHER[base.as], ADMIN]) {
    if (as !== base.as) yield { ...base, as, variant: `as ${as || 'signed out'}` };
  }

  if (!base.data) return;
  const entries = Object.entries(base.data);
  const withField = (key, value, variant) => ({ ...base, data: { ...base.data, [key]: value }, variant });

  yield { ...base, data: { ...base.data, unexpected: 'x' }, variant: 'extra key' };

  for (const [key, value] of entries) {
    const { [key]: _dropped, ...rest } = base.data;
    yield { ...base, data: rest, variant: `without ${key}` };

    if (!isMarker(value)) yield withField(key, retype(value), `${key} retyped`);

    if (typeof value === 'string') {
      for (const length of LENGTHS) yield withField(key, 'x'.repeat(length), `${key} of length ${length}`);
    }
    if (UID_FIELDS.has(key) && typeof value === 'string') yield withField(key, OTHER[value] || BOB, `${key} someone else`);
    if (isAt(value) || (isMarker(value) && value.__op === 'serverTime')) {
      yield withField(key, at(-3_600_000), `${key} an hour ago`);
      yield withField(key, at(3_600_000), `${key} an hour ahead`);
    }
    if (typeof value === 'number') {
      yield withField(key, value + 2, `${key} + 2`);
      yield withField(key, -1, `${key} negative`);
    }
    if (isMarker(value) && value.__op === 'increment') {
      yield withField(key, incrementBy(value.by * 2), `${key} moved by ${value.by * 2}`);
      yield withField(key, incrementBy(-value.by), `${key} moved the other way`);
    }
    if (isMarker(value) && (value.__op === 'arrayUnion' || value.__op === 'arrayRemove')) {
      yield withField(key, { ...value, values: [OTHER[base.as] || BOB] }, `${key} for someone else`);
    }
  }
}

// ---------------------------------------------------------------------------
// The two judges
// ---------------------------------------------------------------------------

let testEnv;
let db;

/** Seed order: profiles before their reservations, parents before children. */
function seedOrder() {
  const rank = (p) => (p.startsWith('users/') ? 0 : p.startsWith('usernames/') ? 1 : 2);
  return Object.keys(SEED).sort((a, b) => rank(a) - rank(b) || a.split('/').length - b.split('/').length);
}

async function seedEmulator() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const batch = writeBatch(context.firestore());
    for (const docPath of Object.keys(SEED)) batch.set(doc(context.firestore(), docPath), forEmulator(SEED[docPath]));
    await batch.commit();
  });
}

function seedShadow() {
  db = initDataDb();
  for (const docPath of seedOrder()) {
    const result = applyWrite(db, { op: 'create', target: parsePath(docPath), after: forReport(SEED[docPath]) });
    if (!result.applied) throw new Error(`could not seed ${docPath}: ${result.note}`);
  }
}

let emulatorDirty = false;

/** true = allowed, false = denied, or an Error the rules never judged. */
async function emulatorVerdict(write) {
  if (emulatorDirty) {
    await seedEmulator();
    emulatorDirty = false;
  }
  const context = write.as ? testEnv.authenticatedContext(write.as) : testEnv.unauthenticatedContext();
  const ref = doc(context.firestore(), write.path);
  const data = write.data ? forEmulator(write.data) : null;
  try {
    if (write.op === 'delete') await deleteDoc(ref);
    else if (write.op === 'update') await updateDoc(ref, data);
    else if (write.op === 'set') await setDoc(ref, data, write.merge ? { merge: true } : {});
    else await setDoc(ref, data);
    emulatorDirty = true;
    return true;
  } catch (error) {
    if (error.code === 'permission-denied' || error.code === 'not-found') return false;
    return error;
  }
}

/** The report the browser would send, split the way forShadow splits it. */
function report(write) {
  if (!write.data) return { data: undefined, remove: [] };
  const data = {};
  const remove = [];
  for (const [key, value] of Object.entries(write.data)) {
    if (isMarker(value) && value.__op === 'deleteField') remove.push(key);
    else data[key] = forReport(value);
  }
  return { data, remove };
}

function policyVerdict(write) {
  const { data, remove } = report(write);
  const outcome = processReport(db, {
    uid: write.as,
    op: write.op,
    target: parsePath(write.path),
    data,
    remove,
    merge: write.merge,
    firestoreOk: false,
    now: Date.now(),
  });
  return outcome.verdict;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-yabby-policy',
    firestore: { rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8') },
  });
  await seedEmulator();
  seedShadow();
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
  closeDataDb();
});

async function judge(writes) {
  const divergences = [];
  const unjudged = [];
  let count = 0;

  for (const write of writes) {
    count += 1;
    const rules = await emulatorVerdict(write);
    if (rules instanceof Error) {
      unjudged.push(`${write.name} [${write.variant}] — ${rules.code || rules.message}`);
      continue;
    }
    const verdict = policyVerdict(write);
    if (verdict.allowed !== rules) {
      divergences.push({
        write: `${write.name} [${write.variant}] ${write.op} ${write.path} as ${write.as || 'signed out'}`,
        direction: verdict.allowed ? 'TOO LOOSE — policy allowed what the rules deny' : 'too strict — policy denied what the rules allow',
        policy: `${verdict.rule}${verdict.variant ? `/${verdict.variant}` : ''}${verdict.reasons.length ? `: ${verdict.reasons.join('; ')}` : ''}`,
      });
    }
  }

  return { count, divergences, unjudged };
}

function describe({ count, divergences, unjudged }) {
  const lines = [`${count} writes judged, ${divergences.length} divergence(s), ${unjudged.length} not judged by the rules`];
  for (const d of divergences) lines.push(`  ${d.direction}\n    ${d.write}\n    ${d.policy}`);
  if (unjudged.length) lines.push('  not judged (the emulator refused before the rules ran):', ...unjudged.map((u) => `    ${u}`));
  return lines.join('\n');
}

test('every valid write is allowed by both', async () => {
  const result = await judge(BASES.map((base) => ({ ...base, variant: 'as written' })));
  const denied = [];
  // Re-judge on a clean emulator: the verdicts must be allowed, not merely equal.
  for (const base of BASES) {
    const rules = await emulatorVerdict({ ...base });
    if (rules !== true) denied.push(`${base.name}: rules ${rules instanceof Error ? rules.message : 'denied'}`);
  }
  console.log(describe(result));
  assert.deepStrictEqual(denied, [], 'a base case the rules deny is not a valid starting point');
  assert.deepStrictEqual(result.divergences, []);
});

test('forbidden writes are denied by both', async () => {
  const result = await judge(FORBIDDEN.map((write) => ({ ...write, variant: 'as written' })));
  console.log(describe(result));
  assert.deepStrictEqual(result.divergences, []);
});

test('every mutation of every valid write gets the same verdict from both', async () => {
  const writes = BASES.flatMap((base) => [...mutationsOf(base)].slice(1));
  const result = await judge(writes);
  console.log(describe(result));
  assert.deepStrictEqual(result.divergences, [], describe(result));
});
