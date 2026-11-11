// Shared shapes for Firestore documents. Components previously redeclared
// these locally with `timestamp: any` — import from here instead.

/** A stored time as the pages read it. The SDK's Timestamp fits, and so do
 *  the stand-ins an optimistic update puts in its place, which carry only
 *  the parts a page reads. */
export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds?: number;
  toDate?(): Date;
  toMillis?(): number;
}

/** Someone who reacted, resolved for the hover tooltip from `reactedBy`. */
export interface Reaction {
  userId: string;
  username: string;
  timestamp: FirestoreTimestamp | null;
}

export interface Reply {
  id: string;
  text: string;
  userId: string;
  timestamp: FirestoreTimestamp;
  username: string;
  avatar: string;
  reactions?: Reaction[];
  reactedBy?: string[];
  reactionCount?: number;
  currentUserReacted?: boolean;
  editedAt?: FirestoreTimestamp;
  imageId?: string;
}

/** Another board whose cross-posted threads are listed on this one. The thread
    itself still lives on the board it names — reacting, replying and editing it
    here all write there — and the tag on the post links back to it. */
export interface CrossPostSource {
  collection: string;
  /** Field that collection is ordered by; news has no lastActivityAt. */
  orderField: 'lastActivityAt' | 'timestamp';
  /** Wording of the tag drawn on the post, and where it points. */
  label: string;
  href: string;
  /** That board's post length cap, so editing one of its posts from here is
      held to the same limit it was written under. Defaults to this board's. */
  postMaxWords?: number;
}

export interface Message {
  id: string;
  text: string;
  userId: string;
  timestamp: FirestoreTimestamp;
  lastActivityAt?: FirestoreTimestamp;
  username: string;
  avatar: string;
  reactions?: Reaction[];
  reactedBy?: string[];
  reactionCount?: number;
  currentUserReacted?: boolean;
  replies?: Reply[];
  replyCount?: number;
  repliesLoaded?: boolean;
  editedAt?: FirestoreTimestamp;
  imageId?: string;
  posterUrl?: string;
  status?: string;
  pollQuestion?: string;
  pollOptions?: string[];
  pollMultiple?: boolean;
  pollVotes?: Record<string, number[]>;
  pollVoterNames?: Record<number, string[]>;
  /** Set when the post came from another board. */
  sourceBoard?: CrossPostSource;
  /** Announcement posted under a bot identity. Admin-only to write, so it is
      the one marker on a post that a member cannot forge. */
  isBot?: boolean;
}

export interface NewsItem {
  id: string;
  text: string;
  userId: string;
  timestamp: FirestoreTimestamp;
  username: string;
  avatar: string;
  editedAt?: FirestoreTimestamp;
}

export interface Sticker {
  stickerId: string;
  userId: string;
  albumId: string;
  text: string;
  position: { x: number; y: number };
  sticker: string;
  timestamp: FirestoreTimestamp;
  favoriteTrackId?: string;
  favoriteTrackTitle?: string;
  // Denormalised at creation so displaying stickers needs no Navidrome lookups
  albumName?: string;
  albumArtist?: string;
}

export interface BaseListItem {
  type: 'album' | 'custom';
  userText: string;
  order: number;
  addedByUserId?: string;
  addedByUsername?: string;
  addedByAvatar?: string;
}

export interface AlbumListItem extends BaseListItem {
  type: 'album';
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  /** Legacy: older items stored a cover URL. Render from albumId instead. */
  albumCover?: string;
}

export interface CustomListItem extends BaseListItem {
  type: 'custom';
  title: string;
  imageUrl?: string;
  linkUrl?: string;
}

export type ListItem = AlbumListItem | CustomListItem;

export interface List<Item extends ListItem = ListItem> {
  id: string;
  title: string;
  userId: string;
  username: string;
  timestamp: FirestoreTimestamp;
  lastUpdated?: FirestoreTimestamp;
  itemCount: number;
  isPublic?: boolean;
  isCollaborative?: boolean;
  items?: Item[];
  // Denormalised onto the list by CreateList on every save, so the lists page
  // needs no subcollection reads to show what was added last.
  lastItemImage?: string;
  lastItemAlbumId?: string;
  lastItemAddedByAvatar?: string;
}
