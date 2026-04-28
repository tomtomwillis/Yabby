import { useEffect, useState } from 'react';
import { collection } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { trackedGetDocs } from '../../utils/firestoreMetrics';
import TravelContributionCard from './TravelContributionCard';
import type { Contribution, Place, PlaceCategory, TravelPhoto } from './travelTypes';
import { CATEGORY_COLOURS, PLACE_CATEGORIES } from './travelTypes';
import './TravelPlaceBubble.css';

const CATEGORY_LABEL: Record<PlaceCategory, string> = PLACE_CATEGORIES.reduce(
  (acc, c) => {
    acc[c.value] = c.label;
    return acc;
  },
  {} as Record<PlaceCategory, string>,
);

interface TravelPlaceBubbleProps {
  place: Place;
  currentUserId: string | null;
  onEditContribution: (
    placeId: string,
    userId: string,
    next: { comment: string; photos: TravelPhoto[]; category: PlaceCategory },
  ) => Promise<void>;
  onDeleteContribution: (placeId: string, userId: string) => Promise<void>;
  onAddOwn?: (place: Place) => void;
}

function cardsPerRow(n: number): number {
  if (n <= 3) return n;
  // Find smallest perRow ≥ 2 where n % perRow !== 1
  for (let perRow = 2; perRow <= n; perRow++) {
    if (n % perRow !== 1) return perRow;
  }
  return n;
}

export default function TravelPlaceBubble({
  place,
  currentUserId,
  onEditContribution,
  onDeleteContribution,
  onAddOwn,
}: TravelPlaceBubbleProps) {
  const [contributions, setContributions] = useState<Contribution[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await trackedGetDocs(collection(db, 'places', place.id, 'contributions'));
        if (cancelled) return;
        const loaded: Contribution[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            userId: data.userId,
            username: data.username || 'Anonymous',
            avatar: data.avatar || '',
            comment: data.comment || '',
            photos: Array.isArray(data.photos) ? data.photos : [],
            createdAt: data.createdAt ?? null,
            editedAt: data.editedAt ?? null,
          };
        });
        loaded.sort((a, b) => {
          const aTime = a.createdAt?.seconds ?? 0;
          const bTime = b.createdAt?.seconds ?? 0;
          return aTime - bTime;
        });
        setContributions(loaded);
      } catch (err) {
        if (!cancelled) setError((err as Error).message || 'Could not load contributions.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [place.id]);

  const handleEdit = async (userId: string, next: { comment: string; photos: TravelPhoto[]; category: PlaceCategory }) => {
    await onEditContribution(place.id, userId, next);
    setContributions((prev) =>
      prev
        ? prev.map((c) => (c.userId === userId ? { ...c, comment: next.comment, photos: next.photos, editedAt: c.editedAt ?? null } : c))
        : prev,
    );
  };

  const handleDelete = async (userId: string) => {
    await onDeleteContribution(place.id, userId);
    setContributions((prev) => (prev ? prev.filter((c) => c.userId !== userId) : prev));
  };

  return (
    <div className="travel-bubble">
      <h3 className="travel-bubble__title">{place.displayName.split(',')[0]}</h3>
      {place.categories.length > 0 && (
        <div className="travel-bubble__categories">
          {place.categories.map((cat) => (
            <span
              key={cat}
              className="travel-bubble__category-chip"
              style={{ backgroundColor: CATEGORY_COLOURS[cat] }}
            >
              {CATEGORY_LABEL[cat] ?? cat}
            </span>
          ))}
        </div>
      )}
      <p className="travel-bubble__subtitle">
        {place.city ? `${place.city}${place.country ? ', ' + place.country : ''}` : place.country}
      </p>
      <hr className="travel-bubble__separator" />

      {error && <p className="travel-bubble__loading">{error}</p>}
      {!error && contributions === null && <p className="travel-bubble__loading">Loading…</p>}
      {!error && contributions !== null && contributions.length === 0 && (
        <p className="travel-bubble__empty">No contributions yet.</p>
      )}

      {contributions && (() => {
        const showAddTile =
          !!onAddOwn &&
          !!currentUserId &&
          !contributions.some((c) => c.userId === currentUserId);
        const tileCount = contributions.length + (showAddTile ? 1 : 0);
        if (tileCount === 0) return null;
        return (
          <div
            className="travel-bubble__cards"
            style={{ '--cards-per-row': cardsPerRow(tileCount) } as React.CSSProperties}
          >
            {contributions.map((c) => (
              <TravelContributionCard
                key={c.userId}
                contribution={c}
                isOwn={c.userId === currentUserId}
                category={place.category}
                onSaveEdit={(next) => handleEdit(c.userId, next)}
                onDelete={() => handleDelete(c.userId)}
              />
            ))}
            {showAddTile && (
              <button
                type="button"
                className="travel-bubble__add-tile"
                onClick={() => onAddOwn?.(place)}
                aria-label="Add your own recommendation for this place"
              >
                <span className="travel-bubble__add-plus" aria-hidden="true">+</span>
                <span className="travel-bubble__add-label">Add yours</span>
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );
}
