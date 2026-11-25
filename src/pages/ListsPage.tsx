import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../firebaseConfig';
import { myLists, publicListsByUpdate } from '../api/areas/lists';
import Header from '../components/basic/Header';
import CreateList from '../components/CreateList';
import { normalizeAvatarPath } from '../utils/avatarPath';
import { albumCoverUrl, displayImageUrl } from '../utils/navidrome';
import './ListsPage.css';
import type { List } from '../types/firestore';

/** What a list is ordered and dated by: when it last changed, falling back to
 *  when it was made for the lists that predate the field. */
const activityMillis = (list: List): number => {
  const stamp = list.lastUpdated ?? list.timestamp;
  return stamp?.toMillis ? stamp.toMillis() : 0;
};

/** What the plate shows, in order of preference: the last thing added to the
 *  list, the sticker of whoever added it, then nothing. */
const plateFor = (list: List): { src: string; kind: 'image' | 'avatar' | 'none' } => {
  if (list.lastItemAlbumId) return { src: albumCoverUrl(list.lastItemAlbumId, 300), kind: 'image' };
  if (list.lastItemImage) return { src: displayImageUrl(list.lastItemImage), kind: 'image' };
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
  const [failed, setFailed] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  // Covers are whatever URL someone pasted, so some of them rot or refuse to be
  // loaded cross-origin. Those fall back to the sleeve rather than to a blank
  // plate — the set has to survive a dead link.
  const [coverFailed, setCoverFailed] = useState<Set<string>>(new Set());

  const fetchLists = useCallback(async () => {
    try {
      setLoading(true);

      setFailed(false);
      // Public lists and your own are separate queries; the merge below
      // re-sorts everything.
      const uid = auth.currentUser?.uid;
      const results = await Promise.all([publicListsByUpdate(), ...(uid ? [myLists(uid)] : [])]);
      const listsById = new Map<string, List>();
      for (const docs of results) {
        for (const { id, data } of docs) listsById.set(id, { ...data, id } as List);
      }

      setLists(Array.from(listsById.values()));
    } catch (err) {
      console.error('Error fetching lists:', err);
      setFailed(true);
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
        ) : failed ? (
          <p className="ls-status">couldn't load the lists. reload the page to try again.</p>
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
