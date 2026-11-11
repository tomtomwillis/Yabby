/**
 * The message board's data logic: mapping documents, merging cross-posted
 * boards into one page, the deep-link pin, and the optimistic changes made to
 * a post before its write lands.
 *
 *   node --test tests/board-data/boardData.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert';

import {
  appendPage,
  applyReplyPreviews,
  mapMessageDoc,
  mapReplyDoc,
  moreToRead,
  newSourceCursors,
  nextPollSelection,
  pinMessage,
  sortByBump,
  takeMergedPage,
  withPendingReply,
  withReaction,
  withoutReply,
} from '../../src/components/board/boardData.ts';

const at = (seconds) => ({ seconds, nanoseconds: 0 });
const msg = (id, seconds, extra = {}) => ({
  id, text: id, userId: 'u', username: 'n', avatar: '', timestamp: at(seconds), lastActivityAt: at(seconds), ...extra,
});
const snap = (id, data) => ({ id, data: () => data });

const NEWS = { collection: 'news', orderField: 'timestamp', label: 'news', href: '/news' };
const FILM = { collection: 'filmClubMessages', orderField: 'lastActivityAt', label: 'film', href: '/film' };

/** A fill that serves each board's posts in chunks, newest first, and records
 *  every read so the tests can count queries. */
function fakeBoards(boards, chunk = { own: 20, cross: 5 }) {
  const reads = [];
  const fill = async (state) => {
    const name = state.source ? state.source.collection : 'own';
    const all = boards[name];
    const start = state.cursor ?? 0;
    const size = state.source ? chunk.cross : chunk.own;
    const docs = all.slice(start, start + size);
    reads.push(name);
    if (docs.length < size) state.exhausted = true;
    if (docs.length > 0) state.cursor = start + docs.length;
    state.buffer.push(...docs.map((m) => ({ ...m, sourceBoard: state.source ?? undefined })));
  };
  return { fill, reads };
}

test('mapMessageDoc fills defaults and marks the reader’s own reaction', () => {
  const m = mapMessageDoc(snap('a', { text: 't', userId: 'x', reactedBy: ['me', 'you'], timestamp: at(1) }), 'me');
  assert.equal(m.username, 'Anonymous');
  assert.equal(m.avatar, '');
  assert.equal(m.reactionCount, 2, 'falls back to reactedBy.length');
  assert.equal(m.replyCount, 0);
  assert.equal(m.currentUserReacted, true);
  assert.equal(m.isBot, false);
  assert.equal(m.pollOptions, undefined);
});

test('mapMessageDoc keeps a stored count, ignores a malformed reactedBy, and tags the source', () => {
  const m = mapMessageDoc(snap('a', { reactedBy: 'oops', reactionCount: 7, isBot: 'yes' }), undefined, NEWS);
  assert.deepEqual(m.reactedBy, []);
  assert.equal(m.reactionCount, 7);
  assert.equal(m.currentUserReacted, false, 'signed out never counts as reacted');
  assert.equal(m.isBot, false, 'only a literal true is a bot');
  assert.equal(m.sourceBoard, NEWS);
});

test('mapReplyDoc marks the reader’s reaction', () => {
  const r = mapReplyDoc(snap('r', { reactedBy: ['me'] }), 'me');
  assert.equal(r.currentUserReacted, true);
  assert.equal(r.reactionCount, 1);
});

test('sortByBump orders by last activity, falling back to the post time', () => {
  const sorted = sortByBump([msg('old', 1), { ...msg('noBump', 5), lastActivityAt: undefined }, msg('new', 9)]);
  assert.deepEqual(sorted.map((m) => m.id), ['new', 'noBump', 'old']);
});

test('takeMergedPage interleaves boards newest first', async () => {
  const { fill } = fakeBoards({
    own: [msg('o1', 100), msg('o2', 80), msg('o3', 60)],
    news: [msg('n1', 90), msg('n2', 70)],
    filmClubMessages: [msg('f1', 85)],
  });
  const states = newSourceCursors([NEWS, FILM]);
  const page = await takeMergedPage(states, 20, fill);
  assert.deepEqual(page.map((m) => m.id), ['o1', 'n1', 'f1', 'o2', 'n2', 'o3']);
  assert.equal(page[1].sourceBoard, NEWS);
  assert.equal(page[0].sourceBoard, undefined);
  assert.equal(moreToRead(states), false, 'every board read to the end');
});

test('takeMergedPage stops at the page size and resumes where it left off', async () => {
  const own = Array.from({ length: 6 }, (_, i) => msg(`o${i}`, 100 - i * 10));
  const news = Array.from({ length: 6 }, (_, i) => msg(`n${i}`, 95 - i * 10));
  const { fill } = fakeBoards({ own, news }, { own: 3, cross: 2 });
  const states = newSourceCursors([NEWS]);

  const first = await takeMergedPage(states, 4, fill);
  assert.deepEqual(first.map((m) => m.id), ['o0', 'n0', 'o1', 'n1']);
  assert.equal(moreToRead(states), true);

  const second = await takeMergedPage(states, 4, fill);
  assert.deepEqual(second.map((m) => m.id), ['o2', 'n2', 'o3', 'n3']);

  const rest = await takeMergedPage(states, 20, fill);
  assert.deepEqual(rest.map((m) => m.id), ['o4', 'n4', 'o5', 'n5']);
  assert.equal(moreToRead(states), false);
});

test('takeMergedPage tops up an empty board before comparing, so order holds across chunks', async () => {
  // News is read two at a time; its third post is newer than the board's
  // second, so it must be fetched before o1 is taken.
  const { fill } = fakeBoards(
    { own: [msg('o0', 100), msg('o1', 50)], news: [msg('n0', 90), msg('n1', 80), msg('n2', 70)] },
    { own: 20, cross: 2 },
  );
  const page = await takeMergedPage(newSourceCursors([NEWS]), 20, fill);
  assert.deepEqual(page.map((m) => m.id), ['o0', 'n0', 'n1', 'n2', 'o1']);
});

test('takeMergedPage buffers unused cross-posts rather than reading them again', async () => {
  const { fill, reads } = fakeBoards(
    { own: [msg('o0', 100), msg('o1', 99), msg('o2', 98)], news: [msg('n0', 10), msg('n1', 9)] },
    { own: 2, cross: 5 },
  );
  const states = newSourceCursors([NEWS]);
  await takeMergedPage(states, 2, fill);
  await takeMergedPage(states, 2, fill);
  assert.equal(reads.filter((r) => r === 'news').length, 1);
});

test('takeMergedPage on an empty board returns nothing and reports no more', async () => {
  const { fill } = fakeBoards({ own: [] });
  const states = newSourceCursors([]);
  assert.deepEqual(await takeMergedPage(states, 20, fill), []);
  assert.equal(moreToRead(states), false);
});

test('a pinned deep link moves to the top and is not listed twice when it pages back in', () => {
  const pinned = msg('deep', 1);
  const list = pinMessage([msg('a', 9), msg('deep', 1), msg('b', 8)], pinned);
  assert.deepEqual(list.map((m) => m.id), ['deep', 'a', 'b']);
  const paged = appendPage(list, [msg('c', 7), msg('deep', 1)]);
  assert.deepEqual(paged.map((m) => m.id), ['deep', 'a', 'b', 'c']);
});

test('applyReplyPreviews marks a thread loaded only when the preview is all of it', () => {
  const tail = [{ id: 'r1' }, { id: 'r2' }];
  const out = applyReplyPreviews(
    [msg('short', 1, { replyCount: 2 }), msg('long', 1, { replyCount: 5 }), msg('open', 1, { replyCount: 9, repliesLoaded: true, replies: [] }), msg('none', 1)],
    [{ id: 'short', replies: tail }, { id: 'long', replies: tail }, { id: 'open', replies: tail }, null],
  );
  assert.equal(out[0].repliesLoaded, true);
  assert.equal(out[1].repliesLoaded, false);
  assert.equal(out[1].replies, tail);
  assert.deepEqual(out[2].replies, [], 'a thread already loaded is left alone');
  assert.equal(out[3].replies, undefined);
});

test('withReaction sets and clears, never goes negative, and drops the resolved names', () => {
  const on = withReaction({ reactionCount: 0, reactedBy: [], reactions: [{ userId: 'x' }] }, 'me', true);
  assert.deepEqual(on.reactedBy, ['me']);
  assert.equal(on.reactionCount, 1);
  assert.equal(on.currentUserReacted, true);
  assert.equal(on.reactions, undefined);
  const off = withReaction(on, 'me', false);
  assert.deepEqual(off.reactedBy, []);
  assert.equal(off.reactionCount, 0);
  assert.equal(withReaction({ reactionCount: 0 }, 'me', false).reactionCount, 0);
});

test('nextPollSelection toggles on a multiple poll and switches or clears on a single one', () => {
  assert.deepEqual(nextPollSelection([], 1, true), [1]);
  assert.deepEqual(nextPollSelection([1, 2], 1, true), [2]);
  assert.deepEqual(nextPollSelection([0], 2, false), [2]);
  assert.deepEqual(nextPollSelection([2], 2, false), []);
  assert.deepEqual(nextPollSelection([0, 2], 2, false), [2], 'a stray multi-selection collapses to the click');
});

test('withPendingReply: a first reply is the whole thread', () => {
  const reply = { id: 'p' };
  const out = withPendingReply(msg('m', 1, { replyCount: 0 }), reply, true, 50);
  assert.deepEqual(out.replies, [reply]);
  assert.equal(out.repliesLoaded, true);
  assert.equal(out.replyCount, 1);
  assert.equal(out.lastActivityAt.seconds, 50);
});

test('withPendingReply: extends a held list, but never builds one from nothing', () => {
  const reply = { id: 'p' };
  const held = withPendingReply(msg('m', 1, { replyCount: 3, replies: [{ id: 'r' }] }), reply, false, 50);
  assert.deepEqual(held.replies.map((r) => r.id), ['r', 'p']);
  assert.equal(held.repliesLoaded, false, 'a preview tail stays a tail');
  assert.equal(held.replyCount, 4);

  const unheld = withPendingReply(msg('m', 1, { replyCount: 3 }), reply, false, 50);
  assert.equal(unheld.replies, undefined);
  assert.equal(unheld.replyCount, 4);
  assert.equal(unheld.lastActivityAt.seconds, 1, 'not bumped when the reply is not shown');
});

test('withoutReply removes the reply and never takes the count below zero', () => {
  const out = withoutReply(msg('m', 1, { replyCount: 2, replies: [{ id: 'a' }, { id: 'b' }] }), 'a');
  assert.deepEqual(out.replies.map((r) => r.id), ['b']);
  assert.equal(out.replyCount, 1);
  assert.equal(withoutReply(msg('m', 1, { replyCount: 0 }), 'x').replyCount, 0);
});
