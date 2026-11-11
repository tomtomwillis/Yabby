// The message board's data logic with no Firestore or React in it, so it can
// be tested under node. Only type imports, which node strips.
import type { DocumentData } from 'firebase/firestore';
import type { CrossPostSource, Message, Reply } from '../../types/firestore';

export const MESSAGES_PER_PAGE = 20;
/* Cross-posts are the exception rather than the rule, so the other boards are
   read a handful at a time. What is fetched and not used stays buffered for the
   next page, so paging on usually costs one query, not three. */
export const CROSS_POST_CHUNK = 5;

/** A document as the mappers read it: a query result, or a single read
 *  already known to exist. */
export interface BoardDoc {
  id: string;
  data(): DocumentData;
}

/** One board being read, and where its reading got to. */
export interface SourceCursor<Cursor = unknown> {
  /** null for the board's own collection. */
  source: CrossPostSource | null;
  cursor: Cursor | null;
  buffer: Message[];
  exhausted: boolean;
}

export function bumpSeconds(message: Message): number {
  return (message.lastActivityAt ?? message.timestamp)?.seconds ?? 0;
}

export function sortByBump(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => bumpSeconds(b) - bumpSeconds(a));
}

export function mapMessageDoc(docSnap: BoardDoc, uid: string | undefined, source?: CrossPostSource): Message {
  const data = docSnap.data();
  const reactedBy: string[] = Array.isArray(data.reactedBy) ? data.reactedBy : [];
  return {
    id: docSnap.id,
    text: data.text,
    userId: data.userId,
    timestamp: data.timestamp,
    lastActivityAt: data.lastActivityAt,
    username: data.username || 'Anonymous',
    avatar: data.avatar || '',
    reactedBy,
    reactionCount: typeof data.reactionCount === 'number' ? data.reactionCount : reactedBy.length,
    replyCount: typeof data.replyCount === 'number' ? data.replyCount : 0,
    currentUserReacted: uid ? reactedBy.includes(uid) : false,
    editedAt: data.editedAt,
    imageId: data.imageId || undefined,
    posterUrl: data.posterUrl || undefined,
    status: data.status || undefined,
    pollQuestion: data.pollQuestion || undefined,
    pollOptions: Array.isArray(data.pollOptions) ? data.pollOptions : undefined,
    pollMultiple: data.pollMultiple,
    pollVotes: data.pollVotes && typeof data.pollVotes === 'object' ? data.pollVotes : undefined,
    sourceBoard: source,
    isBot: data.isBot === true,
  };
}

export function mapReplyDoc(docSnap: BoardDoc, uid: string | undefined): Reply {
  const data = docSnap.data();
  const reactedBy: string[] = Array.isArray(data.reactedBy) ? data.reactedBy : [];
  return {
    id: docSnap.id,
    text: data.text,
    userId: data.userId,
    timestamp: data.timestamp,
    username: data.username || 'Anonymous',
    avatar: data.avatar || '',
    reactedBy,
    reactionCount: typeof data.reactionCount === 'number' ? data.reactionCount : reactedBy.length,
    currentUserReacted: uid ? reactedBy.includes(uid) : false,
    editedAt: data.editedAt,
    imageId: data.imageId,
  };
}

export function newSourceCursors<Cursor>(crossPostSources: CrossPostSource[]): SourceCursor<Cursor>[] {
  return [
    { source: null, cursor: null, buffer: [], exhausted: false },
    ...crossPostSources.map((source) => ({ source, cursor: null, buffer: [], exhausted: false })),
  ];
}

/* One page of the list, merged from every board being read. Each board is
   ordered newest-first already, so taking whichever buffered post is newest
   until the page is full gives the same order across all of them — as long as
   a board that could still have something newer is topped up first, which is
   what the fill below guarantees. `fill` reads that board's next chunk into its
   buffer, and marks it exhausted when there is no more. */
export async function takeMergedPage<Cursor>(
  states: SourceCursor<Cursor>[],
  count: number,
  fill: (state: SourceCursor<Cursor>) => Promise<void>,
): Promise<Message[]> {
  const page: Message[] = [];
  while (page.length < count) {
    await Promise.all(states.filter((s) => s.buffer.length === 0 && !s.exhausted).map(fill));

    let next: SourceCursor<Cursor> | null = null;
    for (const state of states) {
      if (state.buffer.length === 0) continue;
      if (!next || bumpSeconds(state.buffer[0]) > bumpSeconds(next.buffer[0])) next = state;
    }
    if (!next) break;
    page.push(next.buffer.shift()!);
  }
  return page;
}

export const moreToRead = (states: SourceCursor[]) => states.some((s) => s.buffer.length > 0 || !s.exhausted);

/** A further page appended to the list. A deep-linked message pinned to the top
 *  can page back in, so it is not listed twice. */
export function appendPage(prev: Message[], page: Message[]): Message[] {
  return [...prev, ...page.filter((nm) => !prev.some((p) => p.id === nm.id))];
}

/** The deep-linked message moved to the top, wherever it was. */
export function pinMessage(prev: Message[], pinned: Message): Message[] {
  return [pinned, ...prev.filter((m) => m.id !== pinned.id)];
}

/* Previews are written into `replies`, not a second array: every handler on
   the board (react, edit, delete) already operates on `replies`, and a preview
   that lived somewhere else would go stale the moment one of them fired.
   `repliesLoaded` stays false while it is only the tail, so expanding still
   goes and gets the rest — unless the thread turned out to be no longer than
   the preview, in which case this was the whole thread and the expand is free. */
export function applyReplyPreviews(
  prev: Message[],
  previews: ({ id: string; replies: Reply[] } | null)[],
): Message[] {
  return prev.map((m) => {
    const hit = previews.find((p) => p?.id === m.id);
    if (!hit || m.repliesLoaded) return m;
    const complete = (m.replyCount ?? 0) <= hit.replies.length;
    return { ...m, replies: hit.replies, repliesLoaded: complete };
  });
}

type Reactable = Pick<Message, 'currentUserReacted' | 'reactionCount' | 'reactedBy' | 'reactions'>;

/** A post or reply with this user's reaction set or cleared. The tooltip's
 *  names are dropped, to be re-resolved from reactedBy on the next hover. */
export function withReaction<T extends Reactable>(item: T, uid: string, reacted: boolean): T {
  return {
    ...item,
    currentUserReacted: reacted,
    reactionCount: Math.max(0, (item.reactionCount ?? 0) + (reacted ? 1 : -1)),
    reactedBy: reacted
      ? [...(item.reactedBy ?? []), uid]
      : (item.reactedBy ?? []).filter((id) => id !== uid),
    reactions: undefined,
  };
}

/** A voter's selection after clicking an option: a toggle on a multiple-choice
 *  poll, otherwise a switch, or a clear when it is the option already chosen. */
export function nextPollSelection(current: number[], optionIndex: number, multiple: boolean | undefined): number[] {
  if (multiple) {
    return current.includes(optionIndex)
      ? current.filter((i) => i !== optionIndex)
      : [...current, optionIndex];
  }
  return current.length === 1 && current[0] === optionIndex ? [] : [optionIndex];
}

/* A reply shown before its write finishes. A thread with no replies has nothing
   loaded yet, but then the new reply is the whole thread. Otherwise a list is
   only extended if one is held, loaded thread or preview tail alike: a partial
   list built from nothing would pass for the thread. */
export function withPendingReply(message: Message, reply: Reply, firstReply: boolean, nowSeconds: number): Message {
  if (message.replies || firstReply) {
    return {
      ...message,
      replies: [...(message.replies ?? []), reply],
      repliesLoaded: message.repliesLoaded || firstReply,
      replyCount: (message.replyCount ?? 0) + 1,
      lastActivityAt: { seconds: nowSeconds, nanoseconds: 0 },
    };
  }
  return { ...message, replyCount: (message.replyCount ?? 0) + 1 };
}

/** A reply taken off its post, for a delete or a send that failed. */
export function withoutReply(message: Message, replyId: string): Message {
  return {
    ...message,
    replies: message.replies?.filter((r) => r.id !== replyId),
    replyCount: Math.max(0, (message.replyCount ?? 0) - 1),
  };
}
