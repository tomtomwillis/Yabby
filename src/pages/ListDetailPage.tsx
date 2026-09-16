import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { doc, getDoc, collection, query, orderBy, getDocs, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import Header from '../components/basic/Header';
import ListItem from '../components/ListItem';
import CreateList from '../components/CreateList';
import './ListDetailPage.css';

interface List {
  id: string;
  title: string;
  userId: string;
  username: string;
  timestamp: any;
  itemCount: number;
  isPublic?: boolean;
  isCollaborative?: boolean;
  items?: any[];
}

type SortDir = 'newest' | 'oldest';

const formatDate = (timestamp: any): string => {
  const millis = timestamp?.toMillis
    ? timestamp.toMillis()
    : timestamp?.seconds
      ? timestamp.seconds * 1000
      : 0;
  if (!millis) return '';
  return new Date(millis)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
    .toLowerCase();
};

const ListDetailPage: React.FC = () => {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const [list, setList] = useState<List | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [sort, setSort] = useState<SortDir>('oldest');

  // By position, not by time: every save rewrites all the items with a fresh
  // serverTimestamp, so an entry's timestamp says when the list was last edited
  // rather than when the entry was added. Position is the order things went in.
  const shown = useMemo(
    () => (sort === 'newest' ? [...items].reverse() : items),
    [items, sort]
  );

  const chooseSort = (dir: SortDir) => {
    setSort(dir);
    try {
      window.umami?.track?.('list_items_sort_changed', { dir });
    } catch {
      /* ignore umami errors */
    }
  };

  useEffect(() => {
    if (listId) {
      loadList();
    }
  }, [listId]);

  const loadList = async () => {
    if (!listId) return;

    setLoading(true);
    setError(null);

    try {
      // Load main list document
      const listDocRef = doc(db, 'lists', listId);
      const listDoc = await getDoc(listDocRef);

      if (!listDoc.exists()) {
        setError('List not found');
        return;
      }

      const listData = { id: listDoc.id, ...listDoc.data() } as List;
      setList(listData);

      // Load list items
      const itemsQuery = query(
        collection(db, 'lists', listId, 'items'),
        orderBy('order', 'asc')
      );

      const itemsSnapshot = await getDocs(itemsQuery);
      const itemsData: any[] = [];

      itemsSnapshot.forEach((doc) => {
        itemsData.push({ id: doc.id, ...doc.data() });
      });

      setItems(itemsData);
    } catch (error) {
      console.error('Error loading list:', error);
      setError('Failed to load list');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!list || !auth.currentUser) return;

    if (list.userId !== auth.currentUser.uid) {
      alert('You can only delete your own lists');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${list.title}"?`)) {
      return;
    }

    try {
      // Delete all items first
      const itemsQuery = query(collection(db, 'lists', list.id, 'items'));
      const itemsSnapshot = await getDocs(itemsQuery);

      for (const itemDoc of itemsSnapshot.docs) {
        await deleteDoc(itemDoc.ref);
      }

      // Delete the main list document
      await deleteDoc(doc(db, 'lists', list.id));

      navigate('/lists');
    } catch (error) {
      console.error('Error deleting list:', error);
      alert('Failed to delete list. Please try again.');
    }
  };

  const handleEditComplete = () => {
    setIsEditing(false);
    loadList(); // Reload the list to show updated data
  };

  const isOwner = auth.currentUser && list && list.userId === auth.currentUser.uid;
  const canEdit = isOwner || (auth.currentUser && list && list.isCollaborative);

  if (loading) {
    return (
      <div className="list-page">
        <Header title="Lists" subtitle="" />
        <div className="lsd-bar">
          <Link to="/lists" className="lsd-back">◂ lists</Link>
          <span className="lsd-bar-rule" aria-hidden="true" />
        </div>
        <p className="lsd-status">loading…</p>
      </div>
    );
  }

  if (error || !list) {
    return (
      <div className="list-page">
        <Header title="Lists" subtitle="" />
        <div className="lsd-bar">
          <Link to="/lists" className="lsd-back">◂ lists</Link>
          <span className="lsd-bar-rule" aria-hidden="true" />
        </div>
        <p className="lsd-error">{(error || 'List not found').toLowerCase()}</p>
      </div>
    );
  }

  const created = formatDate(list.timestamp);

  return (
    <div className="list-page">
      <Header title={list.title} subtitle={`a list by ${list.username}`} />

      <div className="lsd-bar">
        <Link to="/lists" className="lsd-back">◂ lists</Link>

        <span className="lsd-meta">
          <Link to={`/user/${list.userId}`} className="lsd-by">by {list.username}</Link>
          <span className="lsd-sep" aria-hidden="true">·</span>
          <span>{items.length} item{items.length === 1 ? '' : 's'}</span>
          {created && (
            <>
              <span className="lsd-sep" aria-hidden="true">·</span>
              <span>{created}</span>
            </>
          )}
        </span>

        {list.isPublic === false && <span className="lsd-tag lsd-tag--private">[private]</span>}
        {list.isCollaborative && <span className="lsd-tag">[collab]</span>}

        <span className="lsd-bar-rule" aria-hidden="true" />

        {canEdit && (
          <button
            type="button"
            className="lsd-act"
            onClick={() => setIsEditing((editing) => !editing)}
          >
            {isEditing ? 'cancel' : 'edit'}
          </button>
        )}
        {isOwner && !isEditing && (
          <button type="button" className="lsd-act lsd-act--del" onClick={handleDelete}>
            del
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="lsd-form-band">
          <CreateList
            editMode={true}
            existingListId={list.id}
            existingList={list}
            onListCreated={handleEditComplete}
            onCancel={() => setIsEditing(false)}
            isCollaborativeEdit={!isOwner && !!list.isCollaborative}
          />
        </div>
      ) : items.length > 0 ? (
        <>
          <h2 className="lsd-h">
            <span className="lsd-h-label">entries</span>
            <span className="lsd-h-rule" aria-hidden="true" />
            {items.length > 1 && (
              <span className="lsd-sort">
                <span className="lsd-sort-key">sort:</span>
                <button
                  type="button"
                  className={`lsd-sort-opt${sort === 'newest' ? ' is-sel' : ''}`}
                  aria-pressed={sort === 'newest'}
                  onClick={() => chooseSort('newest')}
                >
                  newest
                </button>
                <span className="lsd-sort-sep" aria-hidden="true">/</span>
                <button
                  type="button"
                  className={`lsd-sort-opt${sort === 'oldest' ? ' is-sel' : ''}`}
                  aria-pressed={sort === 'oldest'}
                  onClick={() => chooseSort('oldest')}
                >
                  oldest
                </button>
              </span>
            )}
          </h2>

          <ol className="lsd-items">
            {shown.map((item, index) => {
              // The number is the entry's place in the list, so reversing the
              // sort counts down rather than renumbering the entries.
              const rank = sort === 'newest' ? items.length - index : index + 1;

              return (
                <li className="lsd-item" key={item.id || index}>
                  <span className="lsd-item-n">{String(rank).padStart(2, '0')}</span>
                  <ListItem
                    {...item}
                    username=""
                    timestamp=""
                    addedByUsername={item.addedByUsername}
                    addedByAvatar={item.addedByAvatar}
                    addedByUserId={item.addedByUserId}
                  />
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className="lsd-empty">this list is empty.</p>
      )}
    </div>
  );
};

export default ListDetailPage;
