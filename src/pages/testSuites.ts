import {
  collection,
  query,
  where,
  orderBy,
  limit,
  doc,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
  type DocumentReference,
} from 'firebase/firestore';
import {
  trackedGetDoc as getDoc,
  trackedGetDocs as getDocs,
  trackedAddDoc as addDoc,
  trackedSetDoc as setDoc,
  trackedUpdateDoc as updateDoc,
  trackedDeleteDoc as deleteDoc,
} from '../utils/firestoreMetrics';
import { db } from '../firebaseConfig';
import { sanitizeHtml } from '../utils/sanitise';
import { placeIdFor } from '../utils/geocode';

/**
 * End-to-end checks for the site's Firestore features.
 *
 * Writes go to the sandbox collections below, which no page other than /test
 * reads. Nothing a suite creates can appear on the real message board, lists,
 * sticker grid or map.
 *
 * The sandbox collections share one rules block with the live ones (see
 * firestore.rules), so a passing suite still proves the production rules work.
 *
 * Reads point at the live collections, because only real data proves the
 * document shapes and indexes are right. Reads change nothing.
 */

export const MARKER = '[yabby-test]';

export const SANDBOX_MESSAGES = 'testMessages';
const SANDBOX_LISTS = 'testLists';
const SANDBOX_STICKERS = 'testStickers';

export interface TestContext {
  uid: string;
  username: string;
  avatar: string;
  /** Register a doc for cleanup. Returns a function to cancel that cleanup
   *  once the test has deleted the doc itself. */
  cleanup: (label: string, fn: () => Promise<void>) => () => void;
}

export interface TestCase {
  name: string;
  run: (ctx: TestContext) => Promise<string>;
}

export interface TestSuite {
  id: string;
  name: string;
  description: string;
  tests: TestCase[];
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requireId(id: string | undefined, what: string): string {
  if (!id) throw new Error(`No ${what} to work with. The earlier step in this suite has to pass first.`);
  return id;
}

function stamp(what: string): string {
  return `${MARKER} ${what}, created ${new Date().toISOString()}`;
}

/** Checks that the rules reject a write. A write that unexpectedly succeeds is
 *  registered for cleanup so a rules mistake does not leave a doc behind. */
async function expectDenied(
  what: string,
  action: () => Promise<unknown>,
  ctx?: TestContext,
): Promise<string> {
  let result: unknown;
  try {
    result = await action();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'permission-denied') return `${what}: rejected`;
    throw new Error(`${what}: failed with "${code ?? (err as Error).message}", expected permission-denied.`);
  }
  const ref = result as DocumentReference | undefined;
  if (ctx && ref && typeof ref.path === 'string') {
    ctx.cleanup(ref.path, () => deleteDoc(ref));
  }
  throw new Error(`${what}: THE WRITE WAS ALLOWED. The rules are too loose.`);
}

// ---------------------------------------------------------------------------
// Message board
// ---------------------------------------------------------------------------

const msgState: {
  messageId?: string;
  disposeMessage?: () => void;
  replyId?: string;
  disposeReply?: () => void;
  pollId?: string;
  disposePoll?: () => void;
} = {};

const messagesSuite: TestSuite = {
  id: 'messages',
  name: 'Message board',
  description:
    'Reads the live board, then posts, edits, reacts, replies, votes in a poll and deletes, all in the sandbox board further down this page. Also checks the rules reject bad writes.',
  tests: [
    {
      name: 'reads the live board',
      run: async () => {
        const snap = await getDocs(
          query(collection(db, 'messages'), orderBy('lastActivityAt', 'desc'), limit(5)),
        );
        assert(!snap.empty, 'No messages came back. The board query or its index is broken.');
        const first = snap.docs[0].data();
        assert(typeof first.text === 'string', 'A message has no text field.');
        assert(typeof first.userId === 'string', 'A message has no userId field.');
        assert(first.timestamp, 'A message has no timestamp field.');
        return `${snap.size} read, newest from ${first.username}`;
      },
    },
    {
      name: 'strips dangerous HTML',
      run: async () => {
        const clean = sanitizeHtml('<script>alert(1)</script><b>bold</b><img src=x onerror=alert(1)>');
        assert(!clean.includes('<script'), 'A script tag got through the sanitiser.');
        assert(!clean.includes('onerror'), 'An event handler got through the sanitiser.');
        assert(clean.includes('<b>'), 'The sanitiser stripped formatting it should keep.');
        return `left "${clean}"`;
      },
    },
    {
      name: 'posts a message',
      run: async (ctx) => {
        msgState.messageId = undefined;
        msgState.replyId = undefined;
        msgState.pollId = undefined;

        const text = sanitizeHtml(stamp('post test'));
        const ref = await addDoc(collection(db, SANDBOX_MESSAGES), {
          text,
          userId: ctx.uid,
          timestamp: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          username: ctx.username,
          avatar: ctx.avatar,
          reactedBy: [],
          reactionCount: 0,
        });
        msgState.messageId = ref.id;
        msgState.disposeMessage = ctx.cleanup(`${SANDBOX_MESSAGES}/${ref.id}`, () => deleteDoc(ref));

        const snap = await getDoc(ref);
        assert(snap.exists(), 'The message was written but cannot be read back.');
        assert(snap.data()?.text === text, 'The saved text does not match what was posted.');
        return `${SANDBOX_MESSAGES}/${ref.id}`;
      },
    },
    {
      name: 'edits the message',
      run: async () => {
        const ref = doc(db, SANDBOX_MESSAGES, requireId(msgState.messageId, 'message'));
        const text = sanitizeHtml(stamp('edit test'));
        await updateDoc(ref, { text, editedAt: serverTimestamp() });

        const snap = await getDoc(ref);
        assert(snap.data()?.text === text, 'The edit did not save.');
        assert(snap.data()?.editedAt, 'editedAt was not set, so the edited label will not show.');
        return 'text and editedAt saved';
      },
    },
    {
      name: 'likes and unlikes',
      run: async (ctx) => {
        const ref = doc(db, SANDBOX_MESSAGES, requireId(msgState.messageId, 'message'));

        await updateDoc(ref, { reactedBy: arrayUnion(ctx.uid), reactionCount: increment(1) });
        let data = (await getDoc(ref)).data();
        assert(data?.reactedBy?.includes(ctx.uid), 'Your id was not added to reactedBy.');
        assert(data?.reactionCount === 1, `Count should be 1, it is ${data?.reactionCount}.`);

        await updateDoc(ref, { reactedBy: arrayRemove(ctx.uid), reactionCount: increment(-1) });
        data = (await getDoc(ref)).data();
        assert(!(data?.reactedBy ?? []).includes(ctx.uid), 'Your id was not removed from reactedBy.');
        assert(data?.reactionCount === 0, `Count should be back to 0, it is ${data?.reactionCount}.`);
        return 'liked, then unliked';
      },
    },
    {
      name: 'rules stop a like being counted twice',
      run: async (ctx) => {
        const ref = doc(db, SANDBOX_MESSAGES, requireId(msgState.messageId, 'message'));
        await updateDoc(ref, { reactedBy: arrayUnion(ctx.uid), reactionCount: increment(1) });
        try {
          return await expectDenied('raising the count without joining reactedBy', () =>
            updateDoc(ref, { reactionCount: increment(1) }),
          );
        } finally {
          await updateDoc(ref, { reactedBy: arrayRemove(ctx.uid), reactionCount: increment(-1) });
        }
      },
    },
    {
      name: 'replies and bumps the parent',
      run: async (ctx) => {
        const messageId = requireId(msgState.messageId, 'message');
        const parent = doc(db, SANDBOX_MESSAGES, messageId);

        const replyRef = await addDoc(collection(db, SANDBOX_MESSAGES, messageId, 'replies'), {
          text: sanitizeHtml(stamp('reply test')),
          userId: ctx.uid,
          timestamp: serverTimestamp(),
          username: ctx.username,
          avatar: ctx.avatar,
          reactedBy: [],
          reactionCount: 0,
        });
        msgState.replyId = replyRef.id;
        msgState.disposeReply = ctx.cleanup(
          `${SANDBOX_MESSAGES}/${messageId}/replies/${replyRef.id}`,
          () => deleteDoc(replyRef),
        );

        await updateDoc(parent, { lastActivityAt: serverTimestamp(), replyCount: increment(1) });

        assert((await getDoc(replyRef)).exists(), 'The reply was written but cannot be read back.');
        const parentData = (await getDoc(parent)).data();
        assert(parentData?.replyCount === 1, `Parent replyCount should be 1, it is ${parentData?.replyCount}.`);
        return 'reply saved, parent bumped';
      },
    },
    {
      name: 'edits and likes the reply',
      run: async (ctx) => {
        const messageId = requireId(msgState.messageId, 'message');
        const replyId = requireId(msgState.replyId, 'reply');
        const ref = doc(db, SANDBOX_MESSAGES, messageId, 'replies', replyId);

        const text = sanitizeHtml(stamp('reply edit test'));
        await updateDoc(ref, { text, editedAt: serverTimestamp() });
        assert((await getDoc(ref)).data()?.text === text, 'The reply edit did not save.');

        await updateDoc(ref, { reactedBy: arrayUnion(ctx.uid), reactionCount: increment(1) });
        assert((await getDoc(ref)).data()?.reactionCount === 1, 'The reply like was not counted.');

        await updateDoc(ref, { reactedBy: arrayRemove(ctx.uid), reactionCount: increment(-1) });
        assert((await getDoc(ref)).data()?.reactionCount === 0, 'The reply like was not removed.');
        return 'edited, liked, unliked';
      },
    },
    {
      name: 'deletes the reply and drops the count',
      run: async () => {
        const messageId = requireId(msgState.messageId, 'message');
        const replyId = requireId(msgState.replyId, 'reply');
        const ref = doc(db, SANDBOX_MESSAGES, messageId, 'replies', replyId);

        await deleteDoc(ref);
        msgState.disposeReply?.();
        await updateDoc(doc(db, SANDBOX_MESSAGES, messageId), { replyCount: increment(-1) });
        msgState.replyId = undefined;

        assert(!(await getDoc(ref)).exists(), 'The reply is still there after deleting it.');
        const parentData = (await getDoc(doc(db, SANDBOX_MESSAGES, messageId))).data();
        assert(parentData?.replyCount === 0, `Parent replyCount should be 0, it is ${parentData?.replyCount}.`);
        return 'reply gone, count back to 0';
      },
    },
    {
      name: 'runs a poll',
      run: async (ctx) => {
        const ref = await addDoc(collection(db, SANDBOX_MESSAGES), {
          text: sanitizeHtml(stamp('poll test')),
          userId: ctx.uid,
          timestamp: serverTimestamp(),
          lastActivityAt: serverTimestamp(),
          username: ctx.username,
          avatar: ctx.avatar,
          reactedBy: [],
          reactionCount: 0,
          pollQuestion: 'Does the test page still work?',
          pollOptions: ['Yes', 'No'],
          pollMultiple: false,
          pollVotes: {},
        });
        msgState.pollId = ref.id;
        msgState.disposePoll = ctx.cleanup(`${SANDBOX_MESSAGES}/${ref.id}`, () => deleteDoc(ref));

        await updateDoc(ref, { [`pollVotes.${ctx.uid}`]: [0] });
        let votes = (await getDoc(ref)).data()?.pollVotes ?? {};
        assert(votes[ctx.uid]?.[0] === 0, 'The first vote was not recorded.');

        await updateDoc(ref, { [`pollVotes.${ctx.uid}`]: [1] });
        votes = (await getDoc(ref)).data()?.pollVotes ?? {};
        assert(votes[ctx.uid]?.[0] === 1, 'Changing the vote did not replace the old one.');
        assert(votes[ctx.uid].length === 1, 'A single choice poll kept more than one answer.');
        return 'created, voted, changed vote';
      },
    },
    {
      name: 'rules stop posting as someone else',
      run: async (ctx) =>
        expectDenied(
          'posting with another user id',
          () =>
            addDoc(collection(db, SANDBOX_MESSAGES), {
              text: sanitizeHtml(stamp('should not exist')),
              userId: 'not-my-uid',
              timestamp: serverTimestamp(),
              lastActivityAt: serverTimestamp(),
              username: ctx.username,
              avatar: ctx.avatar,
              reactedBy: [],
              reactionCount: 0,
            }),
          ctx,
        ),
    },
    {
      name: 'rules stop changing the author name',
      run: async () => {
        const ref = doc(db, SANDBOX_MESSAGES, requireId(msgState.messageId, 'message'));
        return expectDenied('renaming the author of a posted message', () =>
          updateDoc(ref, { username: 'somebody-else' }),
        );
      },
    },
    {
      name: 'deletes both test messages',
      run: async () => {
        const messageId = requireId(msgState.messageId, 'message');
        const pollId = requireId(msgState.pollId, 'poll');

        await deleteDoc(doc(db, SANDBOX_MESSAGES, messageId));
        msgState.disposeMessage?.();
        await deleteDoc(doc(db, SANDBOX_MESSAGES, pollId));
        msgState.disposePoll?.();

        assert(!(await getDoc(doc(db, SANDBOX_MESSAGES, messageId))).exists(), 'The test message is still there.');
        assert(!(await getDoc(doc(db, SANDBOX_MESSAGES, pollId))).exists(), 'The test poll is still there.');
        msgState.messageId = undefined;
        msgState.pollId = undefined;
        return 'both gone';
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

const listState: {
  listId?: string;
  disposeList?: () => void;
  itemIds: string[];
  disposeItems: (() => void)[];
} = { itemIds: [], disposeItems: [] };

const listsSuite: TestSuite = {
  id: 'lists',
  name: 'Lists',
  description:
    'Runs the two queries the Lists page depends on, then builds a sandbox list with an album and a custom entry, edits it, makes it public and deletes it.',
  tests: [
    {
      name: 'reads public lists',
      run: async () => {
        const snap = await getDocs(
          query(
            collection(db, 'lists'),
            where('isPublic', '==', true),
            orderBy('lastUpdated', 'desc'),
            limit(5),
          ),
        );
        if (snap.empty) return 'query works, no public lists yet';
        const first = snap.docs[0].data();
        assert(typeof first.title === 'string', 'A list has no title field.');
        assert(typeof first.itemCount === 'number', 'A list has no itemCount, so its card will be blank.');
        return `${snap.size} read, newest "${first.title}"`;
      },
    },
    {
      name: 'reads your own lists',
      run: async (ctx) => {
        const snap = await getDocs(query(collection(db, 'lists'), where('userId', '==', ctx.uid)));
        return `${snap.size} owned by you`;
      },
    },
    {
      name: 'creates a private list',
      run: async (ctx) => {
        listState.listId = undefined;
        listState.itemIds = [];
        listState.disposeItems = [];

        const ref = await addDoc(collection(db, SANDBOX_LISTS), {
          title: `${MARKER} list`,
          userId: ctx.uid,
          username: ctx.username,
          timestamp: serverTimestamp(),
          itemCount: 0,
          isPublic: false,
          isCollaborative: false,
          lastUpdated: serverTimestamp(),
          lastItemImage: '',
          lastItemLink: '',
          lastItemAddedByAvatar: '',
        });
        listState.listId = ref.id;
        listState.disposeList = ctx.cleanup(`${SANDBOX_LISTS}/${ref.id}`, () => deleteDoc(ref));

        const snap = await getDoc(ref);
        assert(snap.exists(), 'The list was written but cannot be read back.');
        assert(snap.data()?.isPublic === false, 'The list did not save as private.');
        return `${SANDBOX_LISTS}/${ref.id}`;
      },
    },
    {
      name: 'adds an album entry and a custom entry',
      run: async (ctx) => {
        const listId = requireId(listState.listId, 'list');
        const items = collection(db, SANDBOX_LISTS, listId, 'items');

        const albumRef = await addDoc(items, {
          type: 'album',
          userText: `${MARKER} album entry`,
          order: 0,
          timestamp: serverTimestamp(),
          albumId: 'yabby-test-album',
          albumTitle: 'Test Album',
          albumArtist: 'Test Artist',
          albumCover: '',
          addedByUserId: ctx.uid,
          addedByUsername: ctx.username,
          addedByAvatar: ctx.avatar,
        });
        const disposeAlbum = ctx.cleanup(`${SANDBOX_LISTS}/${listId}/items/${albumRef.id}`, () => deleteDoc(albumRef));

        const customRef = await addDoc(items, {
          type: 'custom',
          userText: `${MARKER} custom entry`,
          order: 1,
          timestamp: serverTimestamp(),
          title: 'Test entry',
          linkUrl: 'https://example.com',
          addedByUserId: ctx.uid,
          addedByUsername: ctx.username,
          addedByAvatar: ctx.avatar,
        });
        const disposeCustom = ctx.cleanup(`${SANDBOX_LISTS}/${listId}/items/${customRef.id}`, () => deleteDoc(customRef));

        listState.itemIds = [albumRef.id, customRef.id];
        listState.disposeItems = [disposeAlbum, disposeCustom];
        return '2 entries added';
      },
    },
    {
      name: 'reads the entries back in order',
      run: async () => {
        const listId = requireId(listState.listId, 'list');
        const snap = await getDocs(
          query(collection(db, SANDBOX_LISTS, listId, 'items'), orderBy('order', 'asc')),
        );
        assert(snap.size === 2, `Expected 2 entries, got ${snap.size}.`);
        assert(snap.docs[0].data().type === 'album', 'The entries came back in the wrong order.');
        assert(snap.docs[1].data().title === 'Test entry', 'The custom entry lost its title.');
        return 'both entries in the right order';
      },
    },
    {
      name: 'edits the list and makes it public',
      run: async () => {
        const listId = requireId(listState.listId, 'list');
        const ref = doc(db, SANDBOX_LISTS, listId);
        const title = `${MARKER} list (edited)`;

        await updateDoc(ref, { title, itemCount: 2, isPublic: true, lastUpdated: serverTimestamp() });
        const data = (await getDoc(ref)).data();
        assert(data?.title === title, 'The title change did not save.');
        assert(data?.itemCount === 2, 'itemCount did not update.');

        // Same query shape the Lists page uses, so this also proves the index.
        const snap = await getDocs(
          query(
            collection(db, SANDBOX_LISTS),
            where('isPublic', '==', true),
            orderBy('lastUpdated', 'desc'),
            limit(5),
          ),
        );
        assert(
          snap.docs.some((d) => d.id === listId),
          'The list was made public but does not show up in the public query.',
        );
        return 'edited, published, found in the public query';
      },
    },
    {
      name: 'rules reject a bad entry',
      run: async (ctx) => {
        const listId = requireId(listState.listId, 'list');
        return expectDenied(
          'adding an entry with an unknown type',
          () =>
            addDoc(collection(db, SANDBOX_LISTS, listId, 'items'), {
              type: 'not-a-real-type',
              userText: 'nope',
              order: 99,
              timestamp: serverTimestamp(),
            }),
          ctx,
        );
      },
    },
    {
      name: 'rules stop making a list for someone else',
      run: async (ctx) =>
        expectDenied(
          'creating a list under another user id',
          () =>
            addDoc(collection(db, SANDBOX_LISTS), {
              title: `${MARKER} should not exist`,
              userId: 'not-my-uid',
              username: ctx.username,
              timestamp: serverTimestamp(),
              itemCount: 0,
              isPublic: false,
              isCollaborative: false,
              lastUpdated: serverTimestamp(),
            }),
          ctx,
        ),
    },
    {
      name: 'deletes the entries and the list',
      run: async (ctx) => {
        const listId = requireId(listState.listId, 'list');

        // Entries first. Once the list is gone their delete rule cannot read
        // the parent, so they can never be removed.
        for (const itemId of listState.itemIds) {
          await deleteDoc(doc(db, SANDBOX_LISTS, listId, 'items', itemId));
        }
        listState.disposeItems.forEach((dispose) => dispose());

        await deleteDoc(doc(db, SANDBOX_LISTS, listId));
        listState.disposeList?.();

        // Checked with a query, not getDoc. The list read rule looks at
        // resource.data, which a deleted document does not have, so reading
        // one back answers permission-denied instead of "not found".
        const snap = await getDocs(query(collection(db, SANDBOX_LISTS), where('userId', '==', ctx.uid)));
        assert(!snap.docs.some((d) => d.id === listId), 'The test list is still there.');

        listState.listId = undefined;
        listState.itemIds = [];
        listState.disposeItems = [];
        return 'list and entries gone';
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Stickers
// ---------------------------------------------------------------------------

const stickerState: { stickerId?: string; dispose?: () => void } = {};

const stickersSuite: TestSuite = {
  id: 'stickers',
  name: 'Stickers',
  description:
    'Reads the live sticker feed, then posts a sandbox sticker, edits its text and deletes it. Also checks a sticker cannot be moved or faked after posting.',
  tests: [
    {
      name: 'reads the live feed',
      run: async () => {
        const snap = await getDocs(
          query(collection(db, 'stickers'), orderBy('timestamp', 'desc'), limit(5)),
        );
        assert(!snap.empty, 'No stickers came back. The sticker grid query is broken.');
        const first = snap.docs[0].data();
        assert(typeof first.albumId === 'string', 'A sticker has no albumId, so it cannot be grouped.');
        assert(typeof first.sticker === 'string', 'A sticker has no avatar image field.');
        assert(
          typeof first.position?.x === 'number' && typeof first.position?.y === 'number',
          'A sticker has no numeric position, so it will not sit on the cover.',
        );
        return `${snap.size} read, newest on album ${first.albumId}`;
      },
    },
    {
      name: 'posts a sticker',
      run: async (ctx) => {
        stickerState.stickerId = undefined;
        const text = `${MARKER} sticker test`;

        const ref = await addDoc(collection(db, SANDBOX_STICKERS), {
          userId: ctx.uid,
          albumId: `yabby-test-${Date.now()}`,
          text,
          position: { x: 42.5, y: 17.25 },
          sticker: ctx.avatar || 'avatar_astro_blue.webp',
          timestamp: serverTimestamp(),
        });
        stickerState.stickerId = ref.id;
        stickerState.dispose = ctx.cleanup(`${SANDBOX_STICKERS}/${ref.id}`, () => deleteDoc(ref));

        const data = (await getDoc(ref)).data();
        assert(data?.text === text, 'The sticker text did not save.');
        assert(data?.position?.x === 42.5, 'The sticker position did not save.');
        return `${SANDBOX_STICKERS}/${ref.id}`;
      },
    },
    {
      name: 'edits the sticker text',
      run: async () => {
        const ref = doc(db, SANDBOX_STICKERS, requireId(stickerState.stickerId, 'sticker'));
        const text = `${MARKER} sticker edit test`;
        await updateDoc(ref, { text, editedAt: serverTimestamp() });
        assert((await getDoc(ref)).data()?.text === text, 'The sticker edit did not save.');
        return 'text saved';
      },
    },
    {
      name: 'rules stop moving a posted sticker',
      run: async () => {
        const ref = doc(db, SANDBOX_STICKERS, requireId(stickerState.stickerId, 'sticker'));
        return expectDenied('moving a sticker after posting it', () =>
          updateDoc(ref, { position: { x: 0, y: 0 } }),
        );
      },
    },
    {
      name: 'rules reject a sticker with no position',
      run: async (ctx) =>
        expectDenied(
          'posting a sticker with no position',
          () =>
            addDoc(collection(db, SANDBOX_STICKERS), {
              userId: ctx.uid,
              albumId: 'yabby-test-invalid',
              text: `${MARKER} should not exist`,
              sticker: ctx.avatar || 'avatar_astro_blue.webp',
              timestamp: serverTimestamp(),
            }),
          ctx,
        ),
    },
    {
      name: 'rules stop posting a sticker as someone else',
      run: async (ctx) =>
        expectDenied(
          'posting a sticker under another user id',
          () =>
            addDoc(collection(db, SANDBOX_STICKERS), {
              userId: 'not-my-uid',
              albumId: 'yabby-test-invalid',
              text: `${MARKER} should not exist`,
              position: { x: 1, y: 1 },
              sticker: ctx.avatar || 'avatar_astro_blue.webp',
              timestamp: serverTimestamp(),
            }),
          ctx,
        ),
    },
    {
      name: 'deletes the sticker',
      run: async () => {
        const id = requireId(stickerState.stickerId, 'sticker');
        await deleteDoc(doc(db, SANDBOX_STICKERS, id));
        stickerState.dispose?.();
        assert(!(await getDoc(doc(db, SANDBOX_STICKERS, id))).exists(), 'The test sticker is still there.');
        stickerState.stickerId = undefined;
        return 'gone';
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Travel
// ---------------------------------------------------------------------------

const travelSuite: TestSuite = {
  id: 'travel',
  name: 'Travel',
  description:
    'Read only. Travel pins are written by the backend, which has no sandbox, so adding one would put a pin on the real map. This checks the map data loads and that the browser still cannot write pins directly.',
  tests: [
    {
      name: 'builds place ids correctly',
      run: async () => {
        assert(placeIdFor('node', 123) === 'N_123', 'placeIdFor got a node id wrong.');
        assert(placeIdFor('way', '456') === 'W_456', 'placeIdFor got a way id wrong.');
        assert(placeIdFor('relation', 789) === 'R_789', 'placeIdFor got a relation id wrong.');
        return 'N_, W_ and R_ prefixes correct';
      },
    },
    {
      name: 'reads places',
      run: async () => {
        const snap = await getDocs(query(collection(db, 'places'), limit(5)));
        if (snap.empty) return 'query works, no places yet';
        const first = snap.docs[0].data();
        assert(typeof first.lat === 'number' && typeof first.lng === 'number', 'A place has no numeric coordinates.');
        assert(typeof first.contributorCount === 'number', 'A place has no contributorCount.');
        assert(Array.isArray(first.contributorIds), 'A place has no contributorIds, so the user filter will be empty.');
        return `${snap.size} read, first "${first.displayName}"`;
      },
    },
    {
      name: 'rules block writing pins from the browser',
      run: async () =>
        expectDenied('writing a place from the browser instead of the backend', () =>
          setDoc(doc(db, 'places', 'N_1'), { displayName: `${MARKER} should not exist` }),
        ),
    },
  ],
};

// ---------------------------------------------------------------------------
// Profile stats
// ---------------------------------------------------------------------------

const profileSuite: TestSuite = {
  id: 'profile',
  name: 'Profile stats',
  description:
    'The join date and post count behind the message board poster column. There is no sandbox twin for users, so these run against your own profile document — the only lasting effect is that the post count goes up by one each time the suite runs, and a join date is stamped if you did not have one.',
  tests: [
    {
      name: 'reads your own profile',
      run: async (ctx) => {
        const snap = await getDoc(doc(db, 'users', ctx.uid));
        assert(snap.exists(), 'You have no users document, so nothing can be stamped on it.');
        const data = snap.data();
        assert(typeof data.username === 'string', 'Your profile has no username field.');
        const joined = data.joinedAt ? 'joined set' : 'no join date yet';
        return `${joined}, postCount ${data.postCount ?? 'unset'}`;
      },
    },
    {
      name: 'stamps a join date, then refuses to move it',
      run: async (ctx) => {
        const ref = doc(db, 'users', ctx.uid);
        const before = await getDoc(ref);

        // First login behaviour: a profile without a join date gets one.
        if (!before.data()?.joinedAt) {
          await updateDoc(ref, { joinedAt: serverTimestamp() });
          const after = await getDoc(ref);
          assert(after.data()?.joinedAt, 'The join date did not stick.');
        }

        // Once set it is immutable, which is the only thing that makes it a
        // join date rather than a last-seen date.
        return expectDenied('moving a join date that is already set', () =>
          updateDoc(ref, { joinedAt: serverTimestamp() }),
        );
      },
    },
    {
      name: 'rules stop backdating a join date',
      run: async (ctx) =>
        expectDenied('writing a join date the server did not set', () =>
          updateDoc(doc(db, 'users', ctx.uid), { joinedAt: new Date('2000-01-01T00:00:00Z') }),
        ),
    },
    {
      name: 'counts a post',
      run: async (ctx) => {
        const ref = doc(db, 'users', ctx.uid);
        const before = (await getDoc(ref)).data()?.postCount ?? 0;
        await updateDoc(ref, { postCount: increment(1) });
        const after = (await getDoc(ref)).data()?.postCount;
        assert(after === before + 1, `postCount went from ${before} to ${after}, expected ${before + 1}.`);
        return `${before} → ${after}`;
      },
    },
    {
      name: 'rules stop inflating the post count',
      run: async (ctx) =>
        expectDenied('advancing the post count by more than one', () =>
          updateDoc(doc(db, 'users', ctx.uid), { postCount: increment(5) }),
        ),
    },
    {
      name: 'rules stop a negative post count',
      run: async (ctx) =>
        expectDenied('setting a negative post count', () =>
          updateDoc(doc(db, 'users', ctx.uid), { postCount: -1 }),
        ),
    },
    {
      name: 'rules still reject unknown profile fields',
      run: async (ctx) =>
        expectDenied('adding a field the profile schema does not allow', () =>
          updateDoc(doc(db, 'users', ctx.uid), { isAdmin: true }),
        ),
    },
  ],
};

export const testSuites: TestSuite[] = [messagesSuite, listsSuite, stickersSuite, travelSuite, profileSuite];
