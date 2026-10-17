/**
 * The shadow report outbox: what counts as delivered, what is kept for a
 * retry, what is dropped, and that order holds.
 *
 *   node --test tests/shadow-queue/shadowQueue.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert';

import { createShadowQueue, MAX_REPORTS, FIRST_BACKOFF_MS } from '../../src/api/shadowQueue.ts';

class MemoryStorage {
  constructor() { this.items = new Map(); }
  getItem(key) { return this.items.has(key) ? this.items.get(key) : null; }
  setItem(key, value) { this.items.set(key, String(value)); }
  removeItem(key) { this.items.delete(key); }
}

/** A queue wired to a scripted API: `responses` is consumed one per request. */
function harness({ responses = [], storage = new MemoryStorage(), uid = 'uid-alice' } = {}) {
  const sent = [];
  const tokens = [];
  const timers = [];
  const state = { uid };

  const queue = createShadowQueue({
    currentUid: () => state.uid,
    getToken: async (refresh) => {
      tokens.push(refresh);
      return refresh ? 'fresh' : 'cached';
    },
    fetch: async (url, init) => {
      sent.push(JSON.parse(init.body));
      const next = responses.length ? responses.shift() : 200;
      if (next === 'offline') throw new TypeError('Failed to fetch');
      return new Response(null, { status: next });
    },
    storage: () => storage,
    setTimer: (callback, ms) => { timers.push({ callback, ms }); return timers.length; },
    clearTimer: () => {},
    exclusive: (task) => task(),
    url: '/api/data/shadow',
  });

  return { queue, sent, tokens, timers, storage, state };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const body = (n) => JSON.stringify({ op: 'update', path: `messages/p${n}`, firestoreOk: true });

test('a 2xx report is delivered and leaves nothing queued', async () => {
  const h = harness({ responses: [200] });
  h.queue.enqueue(body(1));
  await settle();
  assert.strictEqual(h.sent.length, 1);
  assert.strictEqual(h.queue.pending('uid-alice'), 0);
  assert.strictEqual(h.timers.length, 0);
});

test('a 204 (outside the canary) counts as delivered', async () => {
  const h = harness({ responses: [204] });
  h.queue.enqueue(body(1));
  await settle();
  assert.strictEqual(h.queue.pending('uid-alice'), 0);
});

test('a 401 retries once at once with a forced token refresh', async () => {
  const h = harness({ responses: [401, 200] });
  h.queue.enqueue(body(1));
  await settle();
  assert.deepStrictEqual(h.tokens, [false, true]);
  assert.strictEqual(h.sent.length, 2);
  assert.strictEqual(h.queue.pending('uid-alice'), 0);
});

test('a 401 that survives the refresh is kept and retried later', async () => {
  const h = harness({ responses: [401, 401] });
  h.queue.enqueue(body(1));
  await settle();
  assert.strictEqual(h.queue.pending('uid-alice'), 1);
  assert.strictEqual(h.timers.length, 1);
  assert.strictEqual(h.timers[0].ms, FIRST_BACKOFF_MS);
});

test('a 5xx or a network failure is kept, with backoff doubling', async () => {
  const h = harness({ responses: [503, 'offline', 200] });
  h.queue.enqueue(body(1));
  await settle();
  assert.strictEqual(h.queue.pending('uid-alice'), 1);

  h.timers.shift().callback();
  await settle();
  assert.strictEqual(h.queue.pending('uid-alice'), 1);
  assert.strictEqual(h.timers[0].ms, FIRST_BACKOFF_MS * 2);

  h.timers.shift().callback();
  await settle();
  assert.strictEqual(h.queue.pending('uid-alice'), 0);
});

test('a 400 is dropped, not retried', async () => {
  const h = harness({ responses: [400] });
  const warn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);
  try {
    h.queue.enqueue(body(1));
    await settle();
  } finally {
    console.warn = warn;
  }
  assert.strictEqual(h.sent.length, 1);
  assert.strictEqual(h.queue.pending('uid-alice'), 0);
  assert.strictEqual(h.timers.length, 0);
  assert.match(warnings[0], /400/);
});

test('the queue keeps its order and stops at the first failure', async () => {
  const h = harness({ responses: ['offline', 'offline', 'offline'] });
  h.queue.enqueue(body(1));
  await settle();
  h.queue.enqueue(body(2));
  h.queue.enqueue(body(3));
  await settle();

  // Every attempt so far was the head; nothing behind it went out.
  assert.strictEqual(h.sent.length, 3);
  assert.ok(h.sent.every((report) => report.path === 'messages/p1'));
  assert.strictEqual(h.queue.pending('uid-alice'), 3);

  h.timers.length = 0;
  await h.queue.flush();
  assert.deepStrictEqual(h.sent.slice(-3).map((report) => report.path), ['messages/p1', 'messages/p2', 'messages/p3']);
  assert.strictEqual(h.queue.pending('uid-alice'), 0);
});

test('reports survive a reload through storage, per uid', async () => {
  const storage = new MemoryStorage();
  const first = harness({ responses: ['offline'], storage });
  first.queue.enqueue(body(1));
  await settle();
  assert.ok(storage.getItem('yabby.shadowOutbox.uid-alice'));

  const other = harness({ storage, uid: 'uid-bob' });
  await other.queue.flush();
  assert.strictEqual(other.sent.length, 0, "another member's queue is not sent with their token");

  const reloaded = harness({ storage });
  await reloaded.queue.flush();
  assert.deepStrictEqual(reloaded.sent.map((report) => report.path), ['messages/p1']);
  assert.strictEqual(storage.getItem('yabby.shadowOutbox.uid-alice'), null);
});

test('signed out, nothing is queued or sent', async () => {
  const h = harness({ uid: null });
  h.queue.enqueue(body(1));
  await settle();
  assert.strictEqual(h.sent.length, 0);
});

test('a full queue drops the oldest reports', async () => {
  const h = harness({ responses: Array(MAX_REPORTS + 10).fill('offline') });
  const warn = console.warn;
  console.warn = () => {};
  try {
    for (let n = 0; n < MAX_REPORTS + 5; n += 1) h.queue.enqueue(body(n));
    await settle();
  } finally {
    console.warn = warn;
  }
  assert.strictEqual(h.queue.pending('uid-alice'), MAX_REPORTS);
  const stored = JSON.parse(h.storage.getItem('yabby.shadowOutbox.uid-alice'));
  assert.strictEqual(JSON.parse(stored[0].body).path, 'messages/p5');
});

test('storage that throws falls back to memory for this tab', async () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const h = harness({ responses: ['offline', 200], storage: broken });
  h.queue.enqueue(body(1));
  await settle();
  assert.strictEqual(h.queue.pending('uid-alice'), 1);
  await h.queue.flush();
  assert.strictEqual(h.queue.pending('uid-alice'), 0);
});
