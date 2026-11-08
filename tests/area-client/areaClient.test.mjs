/**
 * readArea and writeArea: when a read goes to the API, when it falls back to
 * Firestore and is counted, when an error is shown instead, and that a write
 * never falls back.
 *
 *   node --test tests/area-client/areaClient.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert';

import { createAreaClient, ApiError, fallbackReason } from '../../src/api/areaClient.ts';

class MemoryStorage {
  constructor() { this.items = new Map(); }
  getItem(key) { return this.items.has(key) ? this.items.get(key) : null; }
  setItem(key, value) { this.items.set(key, String(value)); }
  removeItem(key) { this.items.delete(key); }
}

function harness({ source = 'sqlite', postFails = false } = {}) {
  const posted = [];
  const guards = [];
  const state = { refreshes: 0 };
  const storage = new MemoryStorage();
  const client = createAreaClient({
    sourceFor: async () => source,
    refreshSources: async () => { state.refreshes += 1; },
    storage: () => storage,
    postFallbacks: async (counts) => {
      if (postFails) throw new ApiError(0, 'down', 'network');
      posted.push(counts);
    },
    guardUnload: (active) => guards.push(active),
    warn: () => {},
  });
  return { client, posted, guards, state, storage };
}

const fromFirestore = async () => 'firestore';
const fromApi = async () => 'api';
const failing = (error) => async () => { throw error; };

test('the flag at firestore reads Firestore and never calls the API', async () => {
  const { client } = harness({ source: 'firestore' });
  assert.strictEqual(await client.readArea('stickers', failing(new Error('must not be called')), fromFirestore), 'firestore');
});

test('the flag at sqlite reads the API', async () => {
  const { client } = harness();
  assert.strictEqual(await client.readArea('stickers', fromApi, fromFirestore), 'api');
});

for (const [name, error, reason] of [
  ['a network error', new ApiError(0, 'x', 'network'), 'network'],
  ['a timeout', new ApiError(0, 'x', 'timeout'), 'timeout'],
  ['a 500', new ApiError(500, 'x'), 'server'],
  ['a 503', new ApiError(503, 'x'), 'server'],
  ['an unexpected throw', new TypeError('failed to fetch'), 'network'],
]) {
  test(`${name} falls back to Firestore and is counted as ${reason}`, async () => {
    const { client } = harness();
    assert.strictEqual(await client.readArea('travel', failing(error), fromFirestore), 'firestore');
    assert.deepStrictEqual(client.pendingFallbacks(), { [`travel|${reason}`]: 1 });
  });
}

for (const status of [400, 403, 404, 409]) {
  test(`a ${status} is a real answer: thrown, not covered up by Firestore`, async () => {
    const { client } = harness();
    await assert.rejects(client.readArea('stickers', failing(new ApiError(status, 'no')), fromFirestore), (error) => error.status === status);
    assert.deepStrictEqual(client.pendingFallbacks(), {});
  });
}

test('when both stores fail the read fails, so the page shows its error', async () => {
  const { client } = harness();
  await assert.rejects(
    client.readArea('stickers', failing(new ApiError(0, 'x', 'network')), failing(new Error('firestore is down too'))),
    /firestore is down too/,
  );
});

test('counts are sent once the API answers, then cleared', async () => {
  const { client, posted } = harness();
  await client.readArea('stickers', failing(new ApiError(0, 'x', 'timeout')), fromFirestore);
  await client.readArea('stickers', failing(new ApiError(0, 'x', 'timeout')), fromFirestore);
  assert.strictEqual(posted.length, 0, 'nothing is sent while the API is away');

  await client.readArea('stickers', fromApi, fromFirestore);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(posted, [[{ area: 'stickers', reason: 'timeout', count: 2 }]]);
  assert.deepStrictEqual(client.pendingFallbacks(), {});
});

test('counts survive a failed post', async () => {
  const { client } = harness({ postFails: true });
  client.countFallback('travel', 'server');
  await client.flushFallbacks();
  assert.deepStrictEqual(client.pendingFallbacks(), { 'travel|server': 1 });
});

test('junk in storage is ignored, never posted', async () => {
  const { client, storage, posted } = harness();
  storage.setItem('yabby.dataFallbacks', JSON.stringify({ 'boards|timeout': 4, 'stickers|timeout': 'lots' }));
  await client.flushFallbacks();
  assert.deepStrictEqual(posted, []);
  storage.setItem('yabby.dataFallbacks', 'not json');
  assert.deepStrictEqual(client.pendingFallbacks(), {});
});

test('a write holds the close-tab guard while in flight and releases it after', async () => {
  const { client, guards } = harness();
  let release;
  const pending = client.writeArea('stickers', () => new Promise((resolve) => { release = resolve; }));
  const second = client.writeArea('stickers', async () => 'b');
  assert.deepStrictEqual(guards, [true]);
  await second;
  assert.deepStrictEqual(guards, [true], 'still held for the first write');
  release('a');
  assert.strictEqual(await pending, 'a');
  assert.deepStrictEqual(guards, [true, false]);
});

test('a failed write is thrown, never retried on Firestore, and the guard is released', async () => {
  const { client, guards } = harness();
  await assert.rejects(client.writeArea('stickers', failing(new ApiError(0, 'x', 'network'))), /x/);
  assert.deepStrictEqual(guards, [true, false]);
  assert.deepStrictEqual(client.pendingFallbacks(), {});
});

test('a 409 on a write fetches the flag again', async () => {
  const { client, state } = harness();
  await assert.rejects(client.writeArea('stickers', failing(new ApiError(409, 'moved'))));
  assert.strictEqual(state.refreshes, 1);
});

test('fallbackReason sorts errors', () => {
  assert.strictEqual(fallbackReason(new ApiError(502, 'x')), 'server');
  assert.strictEqual(fallbackReason(new ApiError(429, 'x')), null);
  assert.strictEqual(fallbackReason(new ApiError(0, 'x', 'timeout')), 'timeout');
  assert.strictEqual(fallbackReason('weird'), 'network');
});
