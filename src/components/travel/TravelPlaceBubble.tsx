import { useEffect, useState } from 'react';
import { collection } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { trackedGetDocs } from '../../utils/firestoreMetrics';
import TravelContributionCard from './TravelContributionCard';
import type { Contribution, Place, TravelPhoto } from './travelTypes';
import './TravelPlaceBubble.css';

interface TravelPlaceBubbleProps {
  place: Place;
  currentUserId: string | null;
  onEditContribution: (
    placeId: string,
    userId: string,
    next: { comment: string; photos: TravelPhoto[] },
  ) => Promise<void>;
  onDeleteContribution: (placeId: string, userId: string) => Promise<void>;
}

export default function TravelPlaceBubble({
  place,
  currentUserId,
  onEditContribution,
  onDeleteContribution,
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

  const handleEdit = async (userId: string, next: { comment: string; photos: TravelPhoto[] }) => {
    await onEditContribution(place.id, userId, next);
    setContributions((prev) =>
      prev
        ? prev.map((c) => (c.userId === userId ? { ...c, ...next, editedAt: c.editedAt ?? null } : c))
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
      <p className="travel-bubble__subtitle">
        {place.city ? `${place.city}${place.country ? ', ' + place.country : ''}` : place.country}
      </p>

      {error && <p className="travel-bubble__loading">{error}</p>}
      {!error && contributions === null && <p className="travel-bubble__loading">Loading…</p>}
      {!error && contributions !== null && contributions.length === 0 && (
        <p className="travel-bubble__empty">No contributions yet.</p>
      )}

      {contributions && contributions.length > 0 && (
        <div className="travel-bubble__cards">
          {contributions.map((c) => (
            <TravelContributionCard
              key={c.userId}
              contribution={c}
              isOwn={c.userId === currentUserId}
              onSaveEdit={(next) => handleEdit(c.userId, next)}
              onDelete={() => handleDelete(c.userId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
