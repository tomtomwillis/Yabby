import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import Header from '../components/basic/Header';
import CreateList from '../components/CreateList';
import { normalizeAvatarPath } from '../utils/avatarPath';
import './ListsPage.css';

interface List {
  id: string;
  title: string;
  userId: string;
  username: string;
  timestamp: any;
  lastUpdated?: any;
  itemCount: number;
  isPublic?: boolean;
  isCollaborative?: boolean;
  // Denormalised onto the list by CreateList on every save, so the sheet needs
  // no subcollection reads to show what was added last.
  lastItemImage?: string;
  lastItemAddedByAvatar?: string;
}

/** What a list is ordered and dated by: when it last changed, falling back to
 *  when it was made for the lists that predate the field. */
const activityMillis = (list: List): number => {
  const stamp = list.lastUpdated ?? list.timestamp;
  return stamp?.toMillis ? stamp.toMillis() : 0;
};

/** What the plate shows, in order of preference: the last thing added to the
 *  list, the sticker of whoever added it, then nothing. */
const plateFor = (list: List): { src: string; kind: 'image' | 'avatar' | 'none' } => {
  if (list.lastItemImage) return { src: list.lastItemImage, kind: 'image' };
  const avatar = normalizeAvatarPath(list.lastItemAddedByAvatar);
  if (avatar) return { src: avatar, kind: 'avatar' };
  return { src: '', kind: 'none' };
};

const formatDate = (millis: number): string => {
  if (!millis) return '—';
  return new Date(millis)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
    .toLowerCase();
};

const ListsPage: React.FC = () => {
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  // Covers are whatever URL someone pasted, so some of them rot or refuse to be
  // loaded cross-origin. Those fall back to the sleeve rather than to a blank
  // plate — the set has to survive a dead link.
  const [coverFailed, setCoverFailed] = useState<Set<string>>(new Set());

  const fetchLists = useCallback(async () => {
    try {
      setLoading(true);

      // The list rule only grants reads on isPublic == true (or your own lists),
      // and Firestore rejects any query the rule cannot verify from the filters
      // alone — so public and own lists must be fetched as separate queries.
      const publicQuery = query(
        collection(db, 'lists'),
        where('isPublic', '==', true),
        orderBy('lastUpdated', 'desc')
      );

      const queries = [getDocs(publicQuery)];

      // No orderBy on this one: the merge below re-sorts everything anyway, so
      // it would only buy a composite index — and ordering by a field excludes
      // documents that lack it, which would silently drop your own older lists.
      const uid = auth.currentUser?.uid;
      if (uid) {
        queries.push(getDocs(query(
          collection(db, 'lists'),
          where('userId', '==', uid)
        )));
      }

      const snapshots = await Promise.all(queries);
      const listsById = new Map<string, List>();

      snapshots.forEach((snapshot) => {
        snapshot.forEach((docSnap) => {
          listsById.set(docSnap.id, { ...docSnap.data(), id: docSnap.id } as List);
        });
      });

      setLists(Array.from(listsById.values()));
    } catch (err) {
      console.error('Error fetching lists:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch lists when auth state is ready (matching the stickers pattern)
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        fetchLists();
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [fetchLists]);

  // Most recently touched first. The two fetches are merged out of a Map, so the
  // order has to be reimposed here whatever order they came back in.
  const sorted = useMemo(
    () => [...lists].sort((a, b) => activityMillis(b) - activityMillis(a)),
    [lists]
  );

  const handleListCreated = () => {
    setShowCreateForm(false);
    fetchLists(); // Re-fetch to show the new list
  };

  return (
    <div className="lists-page">
      <div className="ls-sheet">
        <Header title="Lists" subtitle="albums, records and anything else, in an order someone meant" />

        <div className="ls-bar">
          <span className="ls-bar-label">lists</span>
          <span className="ls-bar-rule" aria-hidden="true" />

          <button
            type="button"
            className="ls-bar-new"
            aria-expanded={showCreateForm}
            onClick={() => setShowCreateForm((open) => !open)}
          >
            {showCreateForm ? 'cancel' : '+ new list'}
          </button>

          <span className="ls-bar-note">
            {lists.length} list{lists.length === 1 ? '' : 's'}
          </span>
        </div>

        {showCreateForm && (
          <div className="ls-form-band">
            <CreateList onListCreated={handleListCreated} onCancel={() => setShowCreateForm(false)} />
          </div>
        )}

        {loading ? (
          <p className="ls-status">loading…</p>
        ) : sorted.length === 0 ? (
          <p className="ls-empty">no lists yet — make the first one.</p>
        ) : (
          <ul className="ls-grid">
            {sorted.map((list) => {
              const plate = coverFailed.has(list.id)
                ? { src: '', kind: 'none' as const }
                : plateFor(list);

              return (
                <li key={list.id}>
                  <Link to={`/lists/${list.id}`} className="ls-cell">
                    <span className={`ls-plate ls-plate--${plate.kind}`}>
                      {plate.kind === 'none' ? (
                        <>
                          <span className="ls-plate-sleeve" aria-hidden="true">{list.title}</span>
                          <span className="ls-plate-mark" aria-hidden="true">·˚⋆</span>
                        </>
                      ) : (
                        <img
                          src={plate.src}
                          alt=""
                          loading="lazy"
                          onError={() => setCoverFailed((failed) => new Set(failed).add(list.id))}
                        />
                      )}
                    </span>

                    <span className="ls-cap">
                      <span className="ls-cap-head">
                        <span className="ls-cap-title">{list.title}</span>
                        {list.isPublic === false && (
                          <span className="ls-cap-tag ls-cap-tag--private">[private]</span>
                        )}
                        {list.isCollaborative && <span className="ls-cap-tag">[collab]</span>}
                      </span>
                      <span className="ls-cap-meta">
                        <span className="ls-cap-by">by {list.username}</span>
                        <span className="ls-cap-sep" aria-hidden="true">·</span>
                        <span className="ls-cap-count">{list.itemCount}</span>
                        <span>item{list.itemCount === 1 ? '' : 's'}</span>
                        <span className="ls-cap-sep" aria-hidden="true">·</span>
                        <span>{formatDate(activityMillis(list))}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ListsPage;
