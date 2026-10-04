import {
  collection,
  query,
  where,
  orderBy,
  limit,
  doc,
  Timestamp,
  type DocumentReference,
} from 'firebase/firestore';
import {
  trackedGetDoc as getDoc,
  trackedGetDocs as getDocs,
} from '../utils/firestoreMetrics';
// The shadowed writers report every write — and every rules denial — to the
// API, so the suites double as the richest source of policy-divergence
// evidence the migration has: each rejection here is a write the port must
// also refuse.
import {
  addDocShadowed as addDoc,
  setDocShadowed as setDoc,
  updateDocShadowed as updateDoc,
  deleteDocShadowed as deleteDoc,
  SERVER_TIME,
  incrementBy,
  arrayUnionOf,
  arrayRemoveOf,
  DELETE_FIELD,
} from '../api/shadow';
import { db } from '../firebaseConfig';
import { sanitizeHtml } from '../utils/sanitise';
import { placeIdFor } from '../utils/geocode';
import { addDays, parseEventLink, todayISO } from '../components/events/eventTypes';
import { getFeedLink } from '../utils/eventInterests';

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
const SANDBOX_EVENTS = 'testEvents';
const SANDBOX_CITIES = 'testEventCities';
const SANDBOX_INTERESTS = 'testEventInterests';

/** The throwaway account, keyed the way /usernames keys its documents. Tests
    that need a member who is not the person running them aim here, so a rule
    that turns out to be too loose costs this account rather than a real one. */
const TEST_ACCOUNT_USERNAME = 'claude test user';

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
          timestamp: SERVER_TIME,
          lastActivityAt: SERVER_TIME,
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
        await updateDoc(ref, { text, editedAt: SERVER_TIME });

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

        await updateDoc(ref, { reactedBy: arrayUnionOf(ctx.uid), reactionCount: incrementBy(1) });
        let data = (await getDoc(ref)).data();
        assert(data?.reactedBy?.includes(ctx.uid), 'Your id was not added to reactedBy.');
        assert(data?.reactionCount === 1, `Count should be 1, it is ${data?.reactionCount}.`);

        await updateDoc(ref, { reactedBy: arrayRemoveOf(ctx.uid), reactionCount: incrementBy(-1) });
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
        await updateDoc(ref, { reactedBy: arrayUnionOf(ctx.uid), reactionCount: incrementBy(1) });
        try {
          return await expectDenied('raising the count without joining reactedBy', () =>
            updateDoc(ref, { reactionCount: incrementBy(1) }),
          );
        } finally {
          await updateDoc(ref, { reactedBy: arrayRemoveOf(ctx.uid), reactionCount: incrementBy(-1) });
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
          timestamp: SERVER_TIME,
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

        await updateDoc(parent, { lastActivityAt: SERVER_TIME, replyCount: incrementBy(1) });

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
        await updateDoc(ref, { text, editedAt: SERVER_TIME });
        assert((await getDoc(ref)).data()?.text === text, 'The reply edit did not save.');

        await updateDoc(ref, { reactedBy: arrayUnionOf(ctx.uid), reactionCount: incrementBy(1) });
        assert((await getDoc(ref)).data()?.reactionCount === 1, 'The reply like was not counted.');

        await updateDoc(ref, { reactedBy: arrayRemoveOf(ctx.uid), reactionCount: incrementBy(-1) });
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
        await updateDoc(doc(db, SANDBOX_MESSAGES, messageId), { replyCount: incrementBy(-1) });
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
          timestamp: SERVER_TIME,
          lastActivityAt: SERVER_TIME,
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
              timestamp: SERVER_TIME,
              lastActivityAt: SERVER_TIME,
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
      name: 'only admins can post as the bot',
      run: async (ctx) => {
        // The bot flag is what makes a post hide its author's profile, so a
        // member being able to set it would be an impersonation route.
        const isAdmin = (await getDoc(doc(db, 'admins', ctx.uid))).exists();
        const botPost = () =>
          addDoc(collection(db, SANDBOX_MESSAGES), {
            text: sanitizeHtml(stamp('bot flag test')),
            userId: ctx.uid,
            timestamp: SERVER_TIME,
            lastActivityAt: SERVER_TIME,
            username: ctx.username,
            avatar: ctx.avatar,
            reactedBy: [],
            reactionCount: 0,
            isBot: true,
          });

        if (!isAdmin) return expectDenied('posting with the bot flag as a member', botPost, ctx);

        const ref = await botPost();
        const dispose = ctx.cleanup(`${SANDBOX_MESSAGES}/${ref.id}`, () => deleteDoc(ref));
        assert((await getDoc(ref)).data()?.isBot === true, 'The bot flag did not save.');
        await deleteDoc(ref);
        dispose();
        return 'allowed for you (admin), and written';
      },
    },
    {
      name: 'rules stop a false bot flag',
      run: async (ctx) =>
        expectDenied(
          'posting with isBot set to false',
          () =>
            addDoc(collection(db, SANDBOX_MESSAGES), {
              text: sanitizeHtml(stamp('should not exist')),
              userId: ctx.uid,
              timestamp: SERVER_TIME,
              lastActivityAt: SERVER_TIME,
              username: ctx.username,
              avatar: ctx.avatar,
              reactedBy: [],
              reactionCount: 0,
              isBot: false,
            }),
          ctx,
        ),
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
          timestamp: SERVER_TIME,
          itemCount: 0,
          isPublic: false,
          isCollaborative: false,
          lastUpdated: SERVER_TIME,
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
          timestamp: SERVER_TIME,
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
          timestamp: SERVER_TIME,
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

        await updateDoc(ref, { title, itemCount: 2, isPublic: true, lastUpdated: SERVER_TIME });
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
              timestamp: SERVER_TIME,
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
              timestamp: SERVER_TIME,
              itemCount: 0,
              isPublic: false,
              isCollaborative: false,
              lastUpdated: SERVER_TIME,
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
          albumName: 'Test Album',
          albumArtist: 'Test Artist',
          text,
          position: { x: 42.5, y: 17.25 },
          sticker: ctx.avatar || 'avatar_astro_blue.webp',
          timestamp: SERVER_TIME,
        });
        stickerState.stickerId = ref.id;
        stickerState.dispose = ctx.cleanup(`${SANDBOX_STICKERS}/${ref.id}`, () => deleteDoc(ref));

        const data = (await getDoc(ref)).data();
        assert(data?.text === text, 'The sticker text did not save.');
        assert(data?.position?.x === 42.5, 'The sticker position did not save.');
        assert(
          data?.albumName === 'Test Album' && data?.albumArtist === 'Test Artist',
          'The album name and artist did not save, so an orphaned sticker would be unreadable.',
        );
        return `${SANDBOX_STICKERS}/${ref.id}`;
      },
    },
    {
      name: 'edits the sticker text',
      run: async () => {
        const ref = doc(db, SANDBOX_STICKERS, requireId(stickerState.stickerId, 'sticker'));
        const text = `${MARKER} sticker edit test`;
        await updateDoc(ref, { text, editedAt: SERVER_TIME });
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
              timestamp: SERVER_TIME,
            }),
          ctx,
        ),
    },
    {
      name: 'rules reject an over-long album name',
      run: async (ctx) =>
        expectDenied(
          'posting a sticker with a 301-character album name',
          () =>
            addDoc(collection(db, SANDBOX_STICKERS), {
              userId: ctx.uid,
              albumId: 'yabby-test-invalid',
              albumName: 'a'.repeat(301),
              text: `${MARKER} should not exist`,
              position: { x: 1, y: 1 },
              sticker: ctx.avatar || 'avatar_astro_blue.webp',
              timestamp: SERVER_TIME,
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
              timestamp: SERVER_TIME,
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
// Calendar events
// ---------------------------------------------------------------------------

const eventState: {
  eventId?: string;
  dispose?: () => void;
  cityId?: string;
  disposeCity?: () => void;
} = {};

/** A throwaway city name — letters only, as the rules want, and new each run so
 *  a leftover from a failed run cannot block the next. */
function testCityName(): string {
  const letters = Array.from({ length: 6 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]);
  return `Yabbytest ${letters.join('')}`;
}

/** A valid sandbox event by the person running the suite. */
function eventDoc(ctx: TestContext, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: `${MARKER} event test`,
    date: todayISO(),
    category: 'gig',
    userId: ctx.uid,
    username: ctx.username,
    createdAt: SERVER_TIME,
    ...overrides,
  };
}

/** An event create the rules should refuse. */
function expectEventDenied(ctx: TestContext, what: string, data: Record<string, unknown>) {
  return expectDenied(what, () => addDoc(collection(db, SANDBOX_EVENTS), data), ctx);
}

const eventsSuite: TestSuite = {
  id: 'events',
  name: 'Calendar',
  description:
    'Reads the live week ahead, then adds a sandbox event with every field, edits it, clears its time, counts you in as interested, moves you to going and out again, and deletes it, and adds and removes a sandbox city. Also checks the rules hold an event to its shape: a date, one of six categories, a yes-or-no hosted flag, http links only, at most five, a real image id, a lineup of named acts, a real place name, a comment of at most 500 characters, interested and going counts that move only you by one and never hold you in both, and nobody writing as someone else.',
  tests: [
    {
      name: 'reads the week ahead',
      run: async () => {
        const today = todayISO();
        const snap = await getDocs(
          query(
            collection(db, 'events'),
            where('date', '>=', today),
            where('date', '<=', addDays(today, 6)),
            orderBy('date'),
            limit(20),
          ),
        );
        if (snap.empty) return 'query works, nothing on this week';
        const first = snap.docs[0].data();
        assert(typeof first.title === 'string' && typeof first.date === 'string', 'An event has no title or date.');
        return `${snap.size} read, first "${first.title}" on ${first.date}`;
      },
    },
    {
      name: 'recognises calendar links and nothing else',
      run: async () => {
        assert(parseEventLink('https://yabbyville.xyz/calendar?event=abc123') === 'abc123', 'A calendar link was not recognised.');
        assert(parseEventLink('https://evil.example/calendar?event=abc123') === null, 'A link to another site was taken for an event.');
        assert(parseEventLink('https://yabbyville.xyz/calendar?event=../x') === null, 'A malformed event id was accepted.');
        assert(parseEventLink('https://yabbyville.xyz/travel?event=abc123') === null, 'A link to another page was taken for an event.');
        return 'site calendar links only';
      },
    },
    {
      name: 'adds an event with every field',
      run: async (ctx) => {
        eventState.eventId = undefined;
        const ref = await addDoc(
          collection(db, SANDBOX_EVENTS),
          eventDoc(ctx, {
            category: 'club',
            time: '22:00',
            endTime: '03:00',
            timeZone: 'America/Argentina/Buenos_Aires',
            description: `${MARKER} description`,
            comment: `${MARKER} why I'm interested`,
            location: 'the basement',
            city: 'Glasgow',
            lineup: [{ name: 'Djrum', artistId: 'abc123' }, { name: 'Support act' }],
            cost: '£5',
            urls: ['https://example.org/tickets', 'http://example.org'],
            imageId: '0f8fad5b-d9cb-469f-a165-70867728950e',
            hosted: true,
          }),
        );
        eventState.eventId = ref.id;
        eventState.dispose = ctx.cleanup(`${SANDBOX_EVENTS}/${ref.id}`, () => deleteDoc(ref));

        const data = (await getDoc(ref)).data();
        assert(data?.time === '22:00' && data?.endTime === '03:00', 'The times did not save.');
        assert(data?.timeZone === 'America/Argentina/Buenos_Aires', 'The time zone did not save.');
        assert(Array.isArray(data?.urls) && data.urls.length === 2, 'The links did not save.');
        assert(data?.username === ctx.username, 'The author name did not save.');
        assert(data?.city === 'Glasgow', 'The city did not save.');
        assert(data?.comment === `${MARKER} why I'm interested`, 'The comment did not save.');
        assert(data?.lineup?.[0]?.artistId === 'abc123' && !('artistId' in data.lineup[1]), 'The lineup did not save as written.');
        return `${SANDBOX_EVENTS}/${ref.id}`;
      },
    },
    {
      name: 'edits the event and clears its times',
      run: async () => {
        const ref = doc(db, SANDBOX_EVENTS, requireId(eventState.eventId, 'event'));
        await updateDoc(ref, {
          title: `${MARKER} event edit test`,
          category: 'event',
          hosted: false,
          time: DELETE_FIELD,
          endTime: DELETE_FIELD,
          timeZone: DELETE_FIELD,
          updatedAt: SERVER_TIME,
        });
        const data = (await getDoc(ref)).data();
        assert(data?.category === 'event' && data?.hosted === false, 'The edit did not save.');
        assert(!('time' in (data ?? {})) && !('endTime' in (data ?? {})), 'The times are still there.');
        return 'edited, now all day';
      },
    },
    {
      name: 'counts you in as interested, then out',
      run: async (ctx) => {
        const ref = doc(db, SANDBOX_EVENTS, requireId(eventState.eventId, 'event'));
        await updateDoc(ref, { interestedBy: arrayUnionOf(ctx.uid), interestCount: incrementBy(1) });
        const ticked = (await getDoc(ref)).data();
        await updateDoc(ref, { interestedBy: arrayRemoveOf(ctx.uid), interestCount: incrementBy(-1) });
        const unticked = (await getDoc(ref)).data();
        assert(ticked?.interestCount === 1 && ticked?.interestedBy?.includes(ctx.uid), 'The tick was not counted.');
        assert(unticked?.interestCount === 0 && unticked?.interestedBy?.length === 0, 'The untick was not counted off.');
        return 'counted 1, then 0';
      },
    },
    {
      name: 'moves you from interested to going and back out',
      run: async (ctx) => {
        const ref = doc(db, SANDBOX_EVENTS, requireId(eventState.eventId, 'event'));
        await updateDoc(ref, { interestedBy: arrayUnionOf(ctx.uid), interestCount: incrementBy(1) });
        await updateDoc(ref, {
          interestedBy: arrayRemoveOf(ctx.uid),
          interestCount: incrementBy(-1),
          goingBy: arrayUnionOf(ctx.uid),
          goingCount: incrementBy(1),
        });
        const going = (await getDoc(ref)).data();
        await updateDoc(ref, { goingBy: arrayRemoveOf(ctx.uid), goingCount: incrementBy(-1) });
        const neither = (await getDoc(ref)).data();
        assert(going?.goingCount === 1 && going?.goingBy?.includes(ctx.uid), 'Going was not counted.');
        assert(going?.interestCount === 0 && !going?.interestedBy?.includes(ctx.uid), 'Interested was not counted off.');
        assert(neither?.goingCount === 0 && neither?.goingBy?.length === 0, 'Not going was not counted off.');
        return 'interested → going → neither';
      },
    },
    {
      name: 'rules stop being interested and going at once',
      run: async (ctx) => {
        const ref = doc(db, SANDBOX_EVENTS, requireId(eventState.eventId, 'event'));
        return expectDenied('ticking interested and going in one write', () =>
          updateDoc(ref, {
            interestedBy: arrayUnionOf(ctx.uid),
            interestCount: incrementBy(1),
            goingBy: arrayUnionOf(ctx.uid),
            goingCount: incrementBy(1),
          }),
        );
      },
    },
    {
      name: 'rules stop marking someone else going',
      run: async () => {
        const ref = doc(db, SANDBOX_EVENTS, requireId(eventState.eventId, 'event'));
        return expectDenied('adding another uid to goingBy', () =>
          updateDoc(ref, { goingBy: arrayUnionOf('not-my-uid'), goingCount: incrementBy(1) }),
        );
      },
    },
    {
      name: 'rules stop a going count that moves alone',
      run: async () => {
        const ref = doc(db, SANDBOX_EVENTS, requireId(eventState.eventId, 'event'));
        return expectDenied('raising goingCount with no one added', () => updateDoc(ref, { goingCount: incrementBy(3) }));
      },
    },
    {
      name: 'rules reject a comment over 500 characters',
      run: async (ctx) => expectEventDenied(ctx, 'adding an event with a long comment', eventDoc(ctx, { comment: 'x'.repeat(501) })),
    },
    {
      name: 'rules stop counting someone else in',
      run: async () => {
        const ref = doc(db, SANDBOX_EVENTS, requireId(eventState.eventId, 'event'));
        return expectDenied('adding another uid to interestedBy', () =>
          updateDoc(ref, { interestedBy: arrayUnionOf('not-my-uid'), interestCount: incrementBy(1) }),
        );
      },
    },
    {
      name: 'rules stop an interest count that does not match',
      run: async (ctx) => {
        const ref = doc(db, SANDBOX_EVENTS, requireId(eventState.eventId, 'event'));
        return expectDenied('ticking once and counting two', () =>
          updateDoc(ref, { interestedBy: arrayUnionOf(ctx.uid), interestCount: incrementBy(2) }),
        );
      },
    },
    {
      name: 'rules stop an interest tick that edits the event',
      run: async (ctx) => {
        const ref = doc(db, SANDBOX_EVENTS, requireId(eventState.eventId, 'event'));
        return expectDenied('ticking interested and retitling in one write', () =>
          updateDoc(ref, { interestedBy: arrayUnionOf(ctx.uid), interestCount: incrementBy(1), title: 'mine now' }),
        );
      },
    },
    {
      name: 'rules reject hosted that is not a yes or no',
      run: async (ctx) => expectEventDenied(ctx, 'adding an event hosted "yes"', eventDoc(ctx, { hosted: 'yes' })),
    },
    {
      name: 'rules stop an event made with interest already on it',
      run: async (ctx) =>
        expectEventDenied(ctx, 'adding an event with a count', eventDoc(ctx, { interestedBy: [ctx.uid], interestCount: 1 })),
    },
    {
      name: 'rules stop an edit without a timestamp',
      run: async () => {
        const ref = doc(db, SANDBOX_EVENTS, requireId(eventState.eventId, 'event'));
        return expectDenied('editing an event without stamping updatedAt', () =>
          updateDoc(ref, { title: `${MARKER} unstamped` }),
        );
      },
    },
    {
      name: 'rules stop handing the event to someone else',
      run: async () => {
        const ref = doc(db, SANDBOX_EVENTS, requireId(eventState.eventId, 'event'));
        return expectDenied('changing the author of an event', () =>
          updateDoc(ref, { userId: 'not-my-uid', updatedAt: SERVER_TIME }),
        );
      },
    },
    {
      name: 'rules require a date',
      run: async (ctx) => {
        const noDate = eventDoc(ctx);
        delete noDate.date;
        return expectEventDenied(ctx, 'adding an event with no date', noDate);
      },
    },
    {
      name: 'rules reject a time zone that is not a zone name',
      run: async (ctx) =>
        expectEventDenied(ctx, 'adding an event in "../etc"', eventDoc(ctx, { time: '20:00', timeZone: '../etc' })),
    },
    {
      name: 'rules stop a time zone with no time',
      run: async (ctx) =>
        expectEventDenied(ctx, 'adding an all-day event with a time zone', eventDoc(ctx, { timeZone: 'Europe/London' })),
    },
    {
      name: 'rules reject an unknown category',
      run: async (ctx) => expectEventDenied(ctx, 'adding a "party" event', eventDoc(ctx, { category: 'party' })),
    },
    {
      name: 'rules reject a javascript link',
      run: async (ctx) =>
        expectEventDenied(ctx, 'adding an event with a javascript: link', eventDoc(ctx, { urls: ['javascript:alert(1)'] })),
    },
    {
      name: 'rules cap links at five',
      run: async (ctx) =>
        expectEventDenied(
          ctx,
          'adding an event with six links',
          eventDoc(ctx, { urls: Array.from({ length: 6 }, (_, i) => `https://example.org/${i}`) }),
        ),
    },
    {
      name: 'rules reject a made-up image id',
      run: async (ctx) =>
        expectEventDenied(
          ctx,
          'adding an event whose image id is a path',
          eventDoc(ctx, { imageId: '../../travel/contributions/xxxxxxxxxx' }),
        ),
    },
    {
      name: 'rules stop an end time with no start',
      run: async (ctx) =>
        expectEventDenied(ctx, 'adding an event with only an end time', eventDoc(ctx, { endTime: '23:00' })),
    },
    {
      name: 'rules reject an act with anything but a name and an artist',
      run: async (ctx) =>
        expectEventDenied(
          ctx,
          'adding an act with a link of its own',
          eventDoc(ctx, { lineup: [{ name: 'x', href: 'javascript:alert(1)' }] }),
        ),
    },
    {
      name: 'rules cap the lineup at twenty acts',
      run: async (ctx) =>
        expectEventDenied(
          ctx,
          'adding an event with twenty-one acts',
          eventDoc(ctx, { lineup: Array.from({ length: 21 }, (_, i) => ({ name: `act ${i}` })) }),
        ),
    },
    {
      name: 'rules reject a city that is not a place name',
      run: async (ctx) =>
        expectEventDenied(ctx, 'adding an event in "Glas/gow"', eventDoc(ctx, { city: 'Glas/gow' })),
    },
    {
      name: 'rules stop adding an event as someone else',
      run: async (ctx) =>
        expectEventDenied(ctx, 'adding an event under another user id', eventDoc(ctx, { userId: 'not-my-uid' })),
    },
    {
      name: 'rules stop adding an event under another name',
      run: async (ctx) =>
        expectEventDenied(ctx, 'adding an event as "Event Bot"', eventDoc(ctx, { username: 'Event Bot' })),
    },
    {
      name: 'adds a city to the list',
      run: async (ctx) => {
        const name = testCityName();
        const ref = doc(db, SANDBOX_CITIES, name.toLowerCase());
        await setDoc(ref, { name, createdBy: ctx.uid, createdAt: SERVER_TIME });
        eventState.cityId = ref.id;
        eventState.disposeCity = ctx.cleanup(`${SANDBOX_CITIES}/${ref.id}`, () => deleteDoc(ref));
        assert((await getDoc(ref)).data()?.name === name, 'The city did not save.');
        return `${SANDBOX_CITIES}/${ref.id}`;
      },
    },
    {
      name: 'rules stop renaming a city',
      run: async () => {
        const ref = doc(db, SANDBOX_CITIES, requireId(eventState.cityId, 'city'));
        return expectDenied('renaming a city', () => updateDoc(ref, { name: 'Somewhere else' }));
      },
    },
    {
      name: 'rules stop filing a city under another name',
      run: async (ctx) =>
        expectDenied(
          'adding "Glasgow" under the id of another city',
          () => setDoc(doc(db, SANDBOX_CITIES, 'edinburgh'), { name: 'Glasgow', createdBy: ctx.uid, createdAt: SERVER_TIME }),
          ctx,
        ),
    },
    {
      name: 'removes the city',
      run: async () => {
        const id = requireId(eventState.cityId, 'city');
        await deleteDoc(doc(db, SANDBOX_CITIES, id));
        eventState.disposeCity?.();
        eventState.cityId = undefined;
        assert(!(await getDoc(doc(db, SANDBOX_CITIES, id))).exists(), 'The test city is still there.');
        return 'gone';
      },
    },
    {
      name: 'deletes the event',
      run: async () => {
        const id = requireId(eventState.eventId, 'event');
        await deleteDoc(doc(db, SANDBOX_EVENTS, id));
        eventState.dispose?.();
        assert(!(await getDoc(doc(db, SANDBOX_EVENTS, id))).exists(), 'The test event is still there.');
        eventState.eventId = undefined;
        return 'gone';
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Calendar interests and the feed
// ---------------------------------------------------------------------------

const interestState: { dispose?: () => void } = {};

const interestsSuite: TestSuite = {
  id: 'eventInterests',
  name: 'Calendar interests',
  description:
    'Ticks and unticks events in a sandbox copy of your interests, marks one going and back, and retires its feed link, then checks the rules keep them private and the link one-way: nobody else may read or write them, the feed version only ever steps up by one, the live copy is never deleted, and the list holds at most 200. Last, asks the backend for your real feed link and fetches it — read only, your ticks are untouched.',
  tests: [
    {
      name: 'starts from an empty sandbox',
      run: async (ctx) => {
        await deleteDoc(doc(db, SANDBOX_INTERESTS, ctx.uid));
        return `${SANDBOX_INTERESTS}/${ctx.uid} cleared`;
      },
    },
    {
      name: 'the first tick creates your interests',
      run: async (ctx) => {
        const ref = doc(db, SANDBOX_INTERESTS, ctx.uid);
        await setDoc(ref, { eventIds: ['yabbytestA'], feedVersion: 1, updatedAt: SERVER_TIME });
        interestState.dispose = ctx.cleanup(`${SANDBOX_INTERESTS}/${ctx.uid}`, () => deleteDoc(ref));
        const data = (await getDoc(ref)).data();
        assert(data?.eventIds?.[0] === 'yabbytestA' && data?.feedVersion === 1, 'The interests did not save.');
        return `${SANDBOX_INTERESTS}/${ctx.uid}`;
      },
    },
    {
      name: 'ticks and unticks events',
      run: async (ctx) => {
        const ref = doc(db, SANDBOX_INTERESTS, ctx.uid);
        await updateDoc(ref, { eventIds: arrayUnionOf('yabbytestB'), updatedAt: SERVER_TIME });
        await updateDoc(ref, { eventIds: arrayRemoveOf('yabbytestA'), updatedAt: SERVER_TIME });
        const ids = (await getDoc(ref)).data()?.eventIds;
        assert(Array.isArray(ids) && ids.length === 1 && ids[0] === 'yabbytestB', `Expected [yabbytestB], got ${JSON.stringify(ids)}.`);
        return 'one ticked, one unticked';
      },
    },
    {
      name: 'marks an event going, then back to interested',
      run: async (ctx) => {
        const ref = doc(db, SANDBOX_INTERESTS, ctx.uid);
        await updateDoc(ref, { goingIds: arrayUnionOf('yabbytestB'), updatedAt: SERVER_TIME });
        const going = (await getDoc(ref)).data()?.goingIds;
        await updateDoc(ref, { goingIds: arrayRemoveOf('yabbytestB'), updatedAt: SERVER_TIME });
        const after = (await getDoc(ref)).data()?.goingIds;
        assert(Array.isArray(going) && going[0] === 'yabbytestB', `Expected going [yabbytestB], got ${JSON.stringify(going)}.`);
        assert(Array.isArray(after) && after.length === 0, `Expected going [], got ${JSON.stringify(after)}.`);
        return 'going, then interested';
      },
    },
    {
      name: 'rules want going as a list',
      run: async (ctx) =>
        expectDenied('storing going as text', () =>
          updateDoc(doc(db, SANDBOX_INTERESTS, ctx.uid), { goingIds: 'yabbytestB', updatedAt: SERVER_TIME }),
        ),
    },
    {
      name: 'a new link moves the feed version up one',
      run: async (ctx) => {
        const ref = doc(db, SANDBOX_INTERESTS, ctx.uid);
        await updateDoc(ref, { feedVersion: incrementBy(1), updatedAt: SERVER_TIME });
        assert((await getDoc(ref)).data()?.feedVersion === 2, 'The feed version did not move to 2.');
        return 'version 2';
      },
    },
    {
      name: 'rules stop skipping a feed version',
      run: async (ctx) =>
        expectDenied('moving the feed version up by two', () =>
          updateDoc(doc(db, SANDBOX_INTERESTS, ctx.uid), { feedVersion: incrementBy(2), updatedAt: SERVER_TIME }),
        ),
    },
    {
      name: 'rules stop reviving an old feed link',
      run: async (ctx) =>
        expectDenied('putting the feed version back to 1', () =>
          updateDoc(doc(db, SANDBOX_INTERESTS, ctx.uid), { feedVersion: 1, updatedAt: SERVER_TIME }),
        ),
    },
    {
      name: 'rules stop a tick without a timestamp',
      run: async (ctx) =>
        expectDenied('ticking without stamping updatedAt', () =>
          updateDoc(doc(db, SANDBOX_INTERESTS, ctx.uid), { eventIds: arrayUnionOf('yabbytestC') }),
        ),
    },
    {
      name: 'rules reject anything but ticks and the feed version',
      run: async (ctx) =>
        expectDenied('adding a "public" flag to your interests', () =>
          updateDoc(doc(db, SANDBOX_INTERESTS, ctx.uid), { public: true, updatedAt: SERVER_TIME }),
        ),
    },
    {
      name: 'rules cap ticks at 200',
      run: async (ctx) =>
        expectDenied('ticking 201 events', () =>
          updateDoc(doc(db, SANDBOX_INTERESTS, ctx.uid), {
            eventIds: Array.from({ length: 201 }, (_, i) => `yabbytest${i}`),
            updatedAt: SERVER_TIME,
          }),
        ),
    },
    {
      name: 'rules want the ticks as a list',
      run: async (ctx) =>
        expectDenied('storing the ticks as text', () =>
          updateDoc(doc(db, SANDBOX_INTERESTS, ctx.uid), { eventIds: 'yabbytestB', updatedAt: SERVER_TIME }),
        ),
    },
    {
      name: "rules stop writing someone else's interests",
      run: async (ctx) =>
        expectDenied(
          'creating interests under another uid',
          () => setDoc(doc(db, SANDBOX_INTERESTS, 'not-my-uid'), { eventIds: [], feedVersion: 1, updatedAt: SERVER_TIME }),
          ctx,
        ),
    },
    {
      name: "rules stop reading someone else's interests",
      run: async () =>
        expectDenied("reading another member's live interests", () => getDoc(doc(db, 'eventInterests', 'not-my-uid'))),
    },
    {
      name: 'rules never delete the live interests',
      run: async (ctx) =>
        expectDenied('deleting your live interests', () => deleteDoc(doc(db, 'eventInterests', ctx.uid))),
    },
    {
      name: 'reads your own live interests',
      run: async (ctx) => {
        const snap = await getDoc(doc(db, 'eventInterests', ctx.uid));
        if (!snap.exists()) return 'nothing ticked yet';
        const ids = snap.data().eventIds;
        assert(Array.isArray(ids), 'eventIds is not a list.');
        return `${ids.length} ticked, feed version ${snap.data().feedVersion}`;
      },
    },
    {
      name: 'the backend hands out a feed that works, and refuses an altered one',
      run: async () => {
        const link = await getFeedLink();
        const response = await fetch(link);
        assert(response.ok, `The feed answered ${response.status}.`);
        const body = await response.text();
        assert(body.startsWith('BEGIN:VCALENDAR'), 'The feed is not a calendar.');
        const events = (body.match(/^BEGIN:VEVENT/gm) ?? []).length;

        // The version bumped by one: signed for another version, so refused.
        const altered = link.replace(/\.([0-9]+)\./, (_, version: string) => `.${Number(version) + 1}.`);
        assert(altered !== link, 'Could not alter the link to test it.');
        const refused = await fetch(altered);
        assert(refused.status === 404, `An altered link answered ${refused.status}, expected 404.`);
        return `${events} event${events === 1 ? '' : 's'} in the feed; altered link refused`;
      },
    },
    {
      name: 'deletes the sandbox interests',
      run: async (ctx) => {
        const ref = doc(db, SANDBOX_INTERESTS, ctx.uid);
        await deleteDoc(ref);
        interestState.dispose?.();
        assert(!(await getDoc(ref)).exists(), 'The sandbox interests are still there.');
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
    'The join date, post and sticker counts and site url behind the message board poster column. There is no sandbox twin for users, so these run against your own profile document — the only lasting effect is that the post count goes up by one each time the suite runs, and a join date is stamped if you did not have one. Your site url and calendar sharing are written over and put back.',
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
      name: 'lists every profile for the directory',
      run: async () => {
        const snap = await getDocs(collection(db, 'users'));
        assert(snap.size > 0, 'The users collection came back empty.');
        return `${snap.size} profiles`;
      },
    },
    {
      name: 'stamps a join date, then refuses to move it',
      run: async (ctx) => {
        const ref = doc(db, 'users', ctx.uid);
        const before = await getDoc(ref);

        // First login behaviour: a profile without a join date gets one, copied
        // from the account's creation time in Auth and so already in the past.
        if (!before.data()?.joinedAt) {
          await updateDoc(ref, { joinedAt: new Date(Date.now() - 60_000) });
          const after = await getDoc(ref);
          assert(after.data()?.joinedAt, 'The join date did not stick.');
        }

        // Once set it is immutable, which is the only thing that makes it a
        // join date rather than a last-seen date.
        return expectDenied('moving a join date that is already set', () =>
          updateDoc(ref, { joinedAt: SERVER_TIME }),
        );
      },
    },
    {
      name: 'rules stop a future join date',
      run: async (ctx) =>
        expectDenied('writing a join date the account cannot have reached yet', () =>
          updateDoc(doc(db, 'users', ctx.uid), { joinedAt: new Date(Date.now() + 86_400_000) }),
        ),
    },
    {
      name: 'counts a post',
      run: async (ctx) => {
        const ref = doc(db, 'users', ctx.uid);
        const before = (await getDoc(ref)).data()?.postCount ?? 0;
        await updateDoc(ref, { postCount: incrementBy(1) });
        const after = (await getDoc(ref)).data()?.postCount;
        assert(after === before + 1, `postCount went from ${before} to ${after}, expected ${before + 1}.`);
        return `${before} → ${after}`;
      },
    },
    {
      name: 'rules stop inflating the post count',
      run: async (ctx) =>
        expectDenied('advancing the post count by more than one', () =>
          updateDoc(doc(db, 'users', ctx.uid), { postCount: incrementBy(5) }),
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
      name: 'counts a sticker, then takes it back off',
      run: async (ctx) => {
        const ref = doc(db, 'users', ctx.uid);
        const before = (await getDoc(ref)).data()?.stickerCount ?? 0;
        await updateDoc(ref, { stickerCount: incrementBy(1) });
        const up = (await getDoc(ref)).data()?.stickerCount;
        await updateDoc(ref, { stickerCount: incrementBy(-1) });
        const down = (await getDoc(ref)).data()?.stickerCount;
        assert(up === before + 1, `stickerCount went from ${before} to ${up}, expected ${before + 1}.`);
        assert(down === before, `stickerCount went back to ${down}, expected ${before}.`);
        return `${before} → ${up} → ${down}`;
      },
    },
    {
      name: 'rules stop the sticker count jumping',
      run: async (ctx) => {
        if (await runnerIsAdmin(ctx)) return 'skipped: you are an admin, and admins may set any sticker count';
        return expectDenied('moving the sticker count by more than one', () =>
          updateDoc(doc(db, 'users', ctx.uid), { stickerCount: incrementBy(2) }),
        );
      },
    },
    {
      name: 'rules stop a negative sticker count',
      run: async (ctx) =>
        expectDenied('setting a negative sticker count', () =>
          updateDoc(doc(db, 'users', ctx.uid), { stickerCount: -1 }),
        ),
    },
    {
      name: 'saves a site url, then puts yours back',
      run: async (ctx) => {
        const ref = doc(db, 'users', ctx.uid);
        const before = (await getDoc(ref)).data()?.siteUrl ?? '';

        await updateDoc(ref, { siteUrl: 'coyburn.neocities.org' });
        const after = (await getDoc(ref)).data()?.siteUrl;
        // Restore first, so a failed assertion cannot leave the test value behind.
        await updateDoc(ref, { siteUrl: before });

        assert(after === 'coyburn.neocities.org', `siteUrl read back as ${after}.`);
        return before ? `restored ${before}` : 'restored empty';
      },
    },
    {
      name: 'rules reject an over-long site url',
      run: async (ctx) =>
        expectDenied('a site url past the 200 character cap', () =>
          updateDoc(doc(db, 'users', ctx.uid), { siteUrl: 'x'.repeat(201) }),
        ),
    },
    {
      name: 'saves social handles, then puts yours back',
      run: async (ctx) => {
        const ref = doc(db, 'users', ctx.uid);
        const before = (await getDoc(ref)).data()?.socials;
        const test = {
          instagram: 'yab.by',
          signal: 'yabby.01',
          bandcampArtist: 'yabby-band',
          steam: '76561198012345678',
          radio: 'https://mixcloud.com/yabby/show-1',
        };

        await updateDoc(ref, { socials: test });
        const after = (await getDoc(ref)).data()?.socials;
        await updateDoc(ref, { socials: before ?? DELETE_FIELD });

        assert(
          after?.instagram === 'yab.by' && after?.bandcampArtist === 'yabby-band'
            && after?.steam === '76561198012345678' && after?.radio === 'https://mixcloud.com/yabby/show-1',
          'socials did not read back.',
        );
        return before ? 'restored yours' : 'removed again';
      },
    },
    {
      name: 'rules reject socials that are not handles',
      run: async (ctx) => {
        const ref = doc(db, 'users', ctx.uid);
        await expectDenied('a pasted link stored as a handle', () =>
          updateDoc(ref, { socials: { instagram: 'https://evil.example/x' } }),
        );
        await expectDenied('a bandcamp subdomain that leaves bandcamp', () =>
          updateDoc(ref, { socials: { bandcampArtist: 'evil.example' } }),
        );
        await expectDenied('a full steam profile link stored as the handle', () =>
          updateDoc(ref, { socials: { steam: 'https://steamcommunity.com/id/yabby' } }),
        );
        await expectDenied('a javascript: link in the radio field', () =>
          updateDoc(ref, { socials: { radio: 'javascript:alert(1)' } }),
        );
        return expectDenied('a platform the schema does not know', () =>
          updateDoc(ref, { socials: { myspace: 'tom' } }),
        );
      },
    },
    {
      name: 'saves calendar sharing, then puts yours back',
      run: async (ctx) => {
        const ref = doc(db, 'users', ctx.uid);
        const data = (await getDoc(ref)).data() ?? {};
        const restore = {
          calendarPublic: 'calendarPublic' in data ? data.calendarPublic : DELETE_FIELD,
          calendarFeedPublic: 'calendarFeedPublic' in data ? data.calendarFeedPublic : DELETE_FIELD,
        };

        await updateDoc(ref, { calendarPublic: true, calendarFeedPublic: false });
        const after = (await getDoc(ref)).data();
        await updateDoc(ref, restore);

        assert(after?.calendarPublic === true && after?.calendarFeedPublic === false, 'The sharing flags did not read back.');
        return 'restored yours';
      },
    },
    {
      name: 'rules reject calendar sharing that is not a yes or no',
      run: async (ctx) =>
        expectDenied('calendarPublic set to text', () =>
          updateDoc(doc(db, 'users', ctx.uid), { calendarPublic: 'yes' }),
        ),
    },
    {
      name: 'saves pronouns, then puts yours back',
      run: async (ctx) => {
        const ref = doc(db, 'users', ctx.uid);
        const data = (await getDoc(ref)).data() ?? {};
        const restore = 'pronouns' in data ? data.pronouns : DELETE_FIELD;

        await updateDoc(ref, { pronouns: 'they/them' });
        const after = (await getDoc(ref)).data()?.pronouns;
        await updateDoc(ref, { pronouns: restore });

        assert(after === 'they/them', `pronouns read back as ${after}.`);
        return 'restored yours';
      },
    },
    {
      name: 'rules reject over-long pronouns',
      run: async (ctx) =>
        expectDenied('pronouns past the 30 character cap', () =>
          updateDoc(doc(db, 'users', ctx.uid), { pronouns: 'x'.repeat(31) }),
        ),
    },
    {
      name: 'rules reject a member moving their own travel count',
      run: async (ctx) => {
        const ref = doc(db, 'users', ctx.uid);
        await expectDenied('bumping travelCount', () => updateDoc(ref, { travelCount: incrementBy(1) }));
        return expectDenied('setting travelCount outright', () => updateDoc(ref, { travelCount: 99 }));
      },
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

// ---------------------------------------------------------------------------
// Username reservations
// ---------------------------------------------------------------------------

const usernameSuite: TestSuite = {
  id: 'usernames',
  name: 'Username reservations',
  description:
    'The /usernames collection that stops one member taking another member\'s name. There is no sandbox twin, so the claim tests use a throwaway name built from your uid and delete it again; your own reservation is only read, never written.',
  tests: [
    {
      name: 'your username is reserved to you',
      run: async (ctx) => {
        const key = ctx.username.toLowerCase();
        const snap = await getDoc(doc(db, 'usernames', key));
        assert(snap.exists(), `"${key}" has no reservation — the backfill has not reached your profile.`);
        assert(
          snap.data()?.uid === ctx.uid,
          `"${key}" is reserved by ${snap.data()?.uid}, not you.`,
        );
        return `"${key}" → you`;
      },
    },
    {
      name: 'claims a free name, then releases it',
      run: async (ctx) => {
        const name = `yb${ctx.uid.slice(0, 10)}`;
        const ref = doc(db, 'usernames', name.toLowerCase());
        const cancel = ctx.cleanup(`username reservation ${name}`, () => deleteDoc(ref));

        await setDoc(ref, { uid: ctx.uid, username: name });
        const snap = await getDoc(ref);
        assert(snap.exists() && snap.data()?.uid === ctx.uid, 'The reservation did not stick.');

        await deleteDoc(ref);
        cancel();
        return `claimed and released "${name}"`;
      },
    },
    {
      name: 'rules stop reserving a name in someone else\'s name',
      run: async (ctx) => {
        const name = `yb${ctx.uid.slice(0, 8)}x`;
        return expectDenied('reserving a name under another uid', () =>
          setDoc(doc(db, 'usernames', name.toLowerCase()), { uid: 'someone-else', username: name }),
        );
      },
    },
    {
      name: 'rules stop a reservation whose id is not its lowercased name',
      run: async (ctx) => {
        const name = `yb${ctx.uid.slice(0, 8)}y`;
        return expectDenied('a reservation id that does not match the name inside it', () =>
          setDoc(doc(db, 'usernames', `${name.toLowerCase()}-other`), { uid: ctx.uid, username: name }),
        );
      },
    },
    {
      name: 'rules stop taking a name another member holds',
      run: async (ctx) => {
        // Sitting under someone else's reservation is the whole attack: find a
        // real one that is not yours and try to overwrite it.
        const others = await getDocs(query(collection(db, 'usernames'), limit(20)));
        const target = others.docs.find((d) => d.data().uid !== ctx.uid);
        if (!target) return 'skipped — no other member has a reservation yet';

        return expectDenied(`overwriting the reservation on "${target.id}"`, () =>
          setDoc(doc(db, 'usernames', target.id), { uid: ctx.uid, username: target.data().username }),
        );
      },
    },
    {
      name: 'rules stop deleting a name another member holds',
      run: async (ctx) => {
        // Admins are allowed to release any name, so running the delete as one
        // would not test the rule — it would just destroy a live reservation,
        // and the rules refuse to let anyone but its owner put it back.
        const isAdmin = (await getDoc(doc(db, 'admins', ctx.uid))).exists();
        if (isAdmin) return 'skipped — you are an admin, and admins may release any name';

        // Always aimed at the test account rather than whichever reservation
        // came back first, so a rule that ever loosens costs a throwaway
        // account its name instead of a member's.
        const target = await getDoc(doc(db, 'usernames', TEST_ACCOUNT_USERNAME));
        if (!target.exists()) return `skipped — "${TEST_ACCOUNT_USERNAME}" holds no reservation`;
        if (target.data().uid === ctx.uid) return 'skipped — that reservation is your own to release';

        return expectDenied(`releasing "${target.id}" out from under its owner`, () =>
          deleteDoc(doc(db, 'usernames', target.id)),
        );
      },
    },
    {
      name: 'rules stop renaming your profile to an unreserved name',
      run: async (ctx) => {
        const name = `yb${ctx.uid.slice(0, 8)}z`;
        return expectDenied('a profile username with no reservation behind it', () =>
          updateDoc(doc(db, 'users', ctx.uid), { username: name }),
        );
      },
    },
    {
      name: 'rules reject a username with stray spaces',
      run: async (ctx) =>
        expectDenied('a username padded with spaces', () =>
          setDoc(doc(db, 'usernames', ' padded '), { uid: ctx.uid, username: ' padded ' }),
        ),
    },
    {
      // A separator at either end reads as the name without it, which is the
      // whole point of reserving names in the first place.
      name: 'rules reject a username ending in a separator',
      run: async (ctx) =>
        expectDenied('a username with a trailing dot', () =>
          setDoc(doc(db, 'usernames', `yb${ctx.uid.slice(0, 6)}.`), {
            uid: ctx.uid,
            username: `yb${ctx.uid.slice(0, 6)}.`,
          }),
        ),
    },
    {
      name: 'dots inside a name are allowed',
      run: async (ctx) => {
        const name = `yb.${ctx.uid.slice(0, 8)}`;
        const ref = doc(db, 'usernames', name.toLowerCase());
        const cancel = ctx.cleanup(`username reservation ${name}`, () => deleteDoc(ref));

        await setDoc(ref, { uid: ctx.uid, username: name });
        await deleteDoc(ref);
        cancel();
        return `"${name}" accepted`;
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

const newsState: { postId?: string; replyId?: string; disposeReply?: () => void } = {};

/** Whether the account running the suite is an admin. The admin-only checks
    below cannot mean anything either way without knowing this — an admin is
    supposed to be able to write news, so denying them would be the bug. */
async function runnerIsAdmin(ctx: TestContext): Promise<boolean> {
  return (await getDoc(doc(db, 'admins', ctx.uid))).exists();
}

const newsSuite: TestSuite = {
  id: 'news',
  name: 'News',
  description:
    'News is a board like the others bar one thing: only an admin may write a post, while any member may react and reply to one. There is no sandbox twin, because seeding one would need an admin, so these run against the real news board — but nothing lasting is written. The like is put back, the reply is deleted and its count with it, the edit attempt writes the text already there, and nothing here bumps a post: lastActivityAt cannot be restored once moved.',
  tests: [
    {
      name: 'reads the live news board',
      run: async () => {
        const snap = await getDocs(
          query(collection(db, 'news'), orderBy('lastActivityAt', 'desc'), limit(5)),
        );
        assert(!snap.empty, 'No news posts have a lastActivityAt. Run scripts/backfill-news-lastactivity.mjs.');
        newsState.postId = snap.docs[0].id;
        const first = snap.docs[0].data();
        assert(typeof first.text === 'string', 'A news post has no text.');
        assert(first.lastActivityAt, 'The newest news post has no lastActivityAt, so it will not sort.');
        return `${snap.size} read, newest by ${first.username ?? 'unknown'}`;
      },
    },
    {
      // The composite index the main board needs to list news alongside its
      // own threads. Without it this query throws failed-precondition.
      name: 'reads the cross-post query the message board runs',
      run: async () => {
        const snap = await getDocs(
          query(
            collection(db, 'news'),
            where('showOnMain', '==', true),
            orderBy('lastActivityAt', 'desc'),
            limit(5),
          ),
        );
        return snap.empty ? 'index works, nothing cross-posted yet' : `${snap.size} cross-posted`;
      },
    },
    {
      name: 'rules stop a member posting news',
      run: async (ctx) => {
        if (await runnerIsAdmin(ctx)) return 'skipped: you are an admin, so writing news is allowed';
        return expectDenied(
          'posting news as a member',
          () =>
            addDoc(collection(db, 'news'), {
              text: sanitizeHtml(stamp('news post test')),
              userId: ctx.uid,
              timestamp: SERVER_TIME,
              lastActivityAt: SERVER_TIME,
              username: ctx.username,
              avatar: ctx.avatar,
              reactedBy: [],
              reactionCount: 0,
            }),
          ctx,
        );
      },
    },
    {
      // Writes back the text already on the post, so a rules hole that let this
      // through would still leave the post reading the same.
      name: 'rules stop a member editing a news post',
      run: async (ctx) => {
        if (await runnerIsAdmin(ctx)) return 'skipped: you are an admin, so editing your own news is allowed';
        const ref = doc(db, 'news', requireId(newsState.postId, 'news post'));
        const text = (await getDoc(ref)).data()?.text ?? '';
        return expectDenied('editing a news post as a member', () =>
          updateDoc(ref, { text, editedAt: SERVER_TIME }),
        );
      },
    },
    {
      // Denied for admins too: the update rule only ever admits text and
      // editedAt, so the flag the main board queries on cannot move.
      name: 'rules stop showOnMain being flipped after posting',
      run: async () => {
        const ref = doc(db, 'news', requireId(newsState.postId, 'news post'));
        const current = (await getDoc(ref)).data()?.showOnMain === true;
        return expectDenied('cross-posting a news post after the fact', () =>
          updateDoc(ref, { showOnMain: !current }),
        );
      },
    },
    {
      name: 'likes and unlikes a news post',
      run: async (ctx) => {
        const ref = doc(db, 'news', requireId(newsState.postId, 'news post'));
        const start = (await getDoc(ref)).data();
        const before = start?.reactionCount ?? 0;
        // This is a real post, so a like already on it is the runner's own and
        // must survive: run the cycle the other way round and restore it.
        const alreadyLiked = (start?.reactedBy ?? []).includes(ctx.uid);
        const like = () => updateDoc(ref, { reactedBy: arrayUnionOf(ctx.uid), reactionCount: incrementBy(1) });
        const unlike = () => updateDoc(ref, { reactedBy: arrayRemoveOf(ctx.uid), reactionCount: incrementBy(-1) });
        const undo = ctx.cleanup(`news like on ${ref.id}`, alreadyLiked ? like : unlike);

        await (alreadyLiked ? unlike() : like());
        let data = (await getDoc(ref)).data();
        const step = alreadyLiked ? -1 : 1;
        assert(
          (data?.reactedBy ?? []).includes(ctx.uid) === !alreadyLiked,
          `Your id was not ${alreadyLiked ? 'removed from' : 'added to'} reactedBy.`,
        );
        assert(data?.reactionCount === before + step, `Count should be ${before + step}, it is ${data?.reactionCount}.`);

        await (alreadyLiked ? like() : unlike());
        undo();
        data = (await getDoc(ref)).data();
        assert((data?.reactedBy ?? []).includes(ctx.uid) === alreadyLiked, 'Your like was not put back how it was.');
        assert(data?.reactionCount === before, `Count should be back to ${before}, it is ${data?.reactionCount}.`);
        return alreadyLiked ? 'unliked, then liked again (you had already liked it)' : 'liked, then unliked';
      },
    },
    {
      // Deliberately does not write lastActivityAt, even though a real reply
      // does: a bump is the one write here that cannot be undone afterwards —
      // the rules only accept request.time, so there is no putting the old
      // value back — and it would leave the post sitting at the top of the
      // main board with no reply under it to explain why. The rule that admits
      // the bump is still covered: replyCount alone goes through the same
      // clause, and the check below holds it to the server clock.
      name: 'replies to a news post',
      run: async (ctx) => {
        const postId = requireId(newsState.postId, 'news post');
        const parent = doc(db, 'news', postId);
        const before = (await getDoc(parent)).data()?.replyCount ?? 0;

        const replyRef = await addDoc(collection(db, 'news', postId, 'replies'), {
          text: sanitizeHtml(stamp('news reply test')),
          userId: ctx.uid,
          timestamp: SERVER_TIME,
          username: ctx.username,
          avatar: ctx.avatar,
          reactedBy: [],
          reactionCount: 0,
        });
        newsState.replyId = replyRef.id;
        newsState.disposeReply = ctx.cleanup(`news/${postId}/replies/${replyRef.id}`, async () => {
          await deleteDoc(replyRef);
          await updateDoc(parent, { replyCount: incrementBy(-1) });
        });

        await updateDoc(parent, { replyCount: incrementBy(1) });

        assert((await getDoc(replyRef)).exists(), 'The reply was written but cannot be read back.');
        const count = (await getDoc(parent)).data()?.replyCount;
        assert(count === before + 1, `Parent replyCount should be ${before + 1}, it is ${count}.`);
        return 'reply saved, count up';
      },
    },
    {
      // A second before the value already there: different enough that the rule
      // has to judge it — writing the same value back changes no key at all, so
      // the rule never sees it — and pointed down the list rather than up, so a
      // rules hole that let it through could not put the post anywhere it has
      // not already been.
      name: 'rules stop a post being bumped to an invented time',
      run: async () => {
        const ref = doc(db, 'news', requireId(newsState.postId, 'news post'));
        const current = (await getDoc(ref)).data()?.lastActivityAt as Timestamp | undefined;
        assert(current, 'The news post has no lastActivityAt to move.');
        const earlier = Timestamp.fromMillis(current.toMillis() - 1000);
        return expectDenied('bumping a news post to a client-chosen time', () =>
          updateDoc(ref, { lastActivityAt: earlier }),
        );
      },
    },
    {
      name: 'deletes the reply and drops the count',
      run: async () => {
        const postId = requireId(newsState.postId, 'news post');
        const replyId = requireId(newsState.replyId, 'reply');
        const ref = doc(db, 'news', postId, 'replies', replyId);
        const parent = doc(db, 'news', postId);
        const before = (await getDoc(parent)).data()?.replyCount ?? 0;

        await deleteDoc(ref);
        await updateDoc(parent, { replyCount: incrementBy(-1) });
        newsState.disposeReply?.();
        newsState.replyId = undefined;

        assert(!(await getDoc(ref)).exists(), 'The reply is still there after deleting it.');
        const count = (await getDoc(parent)).data()?.replyCount;
        assert(count === before - 1, `Parent replyCount should be ${before - 1}, it is ${count}.`);
        return 'reply gone, count back down';
      },
    },
  ],
};

export const testSuites: TestSuite[] = [messagesSuite, listsSuite, stickersSuite, eventsSuite, interestsSuite, travelSuite, profileSuite, usernameSuite, newsSuite];
