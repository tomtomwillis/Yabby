import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Place, PlaceCategory, TravelPhoto } from './travelTypes';
import { CATEGORY_COLOURS, PLACE_CATEGORIES } from './travelTypes';
import TravelPlaceBubble from './TravelPlaceBubble';
import { normalizeAvatarPath } from '../../utils/avatarPath';
import './TravelRecommendationList.css';

interface TravelRecommendationListProps {
  places: Place[];
  currentUserId: string | null;
  onFocus: (place: Place) => void;
  onEditContribution: (
    placeId: string,
    userId: string,
    next: { comment: string; photos: TravelPhoto[]; category: PlaceCategory },
  ) => Promise<void>;
  onDeleteContribution: (placeId: string, userId: string) => Promise<void>;
  onAddOwn?: (place: Place) => void;
  initialExpandedId?: string | null;
}

const PAGE_SIZE = 20;

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  PLACE_CATEGORIES.map((c) => [c.value, c.label.toLowerCase()]),
);

export default function TravelRecommendationList({
  places,
  currentUserId,
  onFocus,
  onEditContribution,
  onDeleteContribution,
  onAddOwn,
  initialExpandedId,
}: TravelRecommendationListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(initialExpandedId ?? null);

  useEffect(() => {
    if (initialExpandedId) setExpandedId(initialExpandedId);
  }, [initialExpandedId]);
  const [showAll, setShowAll] = useState(false);

  if (places.length === 0) {
    return <p className="tv-rec-empty">nothing matches the filter.</p>;
  }

  const visible = showAll ? places : places.slice(0, PAGE_SIZE);
  const hiddenCount = places.length - PAGE_SIZE;

  const toggleExpand = (place: Place) => {
    if (expandedId === place.id) {
      setExpandedId(null);
    } else {
      setExpandedId(place.id);
      onFocus(place);
    }
  };

  return (
    <ul className="tv-rec-list">
      {visible.map((place) => {
        const isExpanded = expandedId === place.id;
        return (
          <li key={place.id} className={`tv-rec${isExpanded ? ' is-open' : ''}`}>
            <div
              role="button"
              tabIndex={0}
              className="tv-rec-row"
              onClick={() => toggleExpand(place)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleExpand(place);
                }
              }}
              aria-expanded={isExpanded}
            >
              <span className="tv-rec-mark" aria-hidden="true">
                ▸
              </span>

              {place.contributorCount >= 2 ? (
                <img className="tv-rec-av" src="/Stickers/avatar_star_pink.webp" alt="" />
              ) : place.firstContributorAvatar ? (
                <img
                  className="tv-rec-av"
                  src={normalizeAvatarPath(place.firstContributorAvatar)}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="tv-rec-av tv-rec-av--none" />
              )}

              <span className="tv-rec-name">{place.displayName.split(',')[0]}</span>
              <span className="tv-rec-leader" aria-hidden="true" />

              <span className="tv-rec-meta">
                {/* The one square of category colour in the listing — the same
                    hue the place's pin carries on the map above. */}
                <span
                  className="tv-rec-swatch"
                  style={{ backgroundColor: CATEGORY_COLOURS[place.category] }}
                  aria-hidden="true"
                />
                <span className="tv-rec-cat">{CATEGORY_LABEL[place.category] ?? place.category}</span>
                {place.city && (
                  <>
                    <span className="tv-rec-sep" aria-hidden="true">
                      ·
                    </span>
                    <span className="tv-rec-city">{place.city}</span>
                  </>
                )}
                <span className="tv-rec-sep" aria-hidden="true">
                  ·
                </span>
                <span className="tv-rec-by">
                  {place.firstContributorUserId ? (
                    <Link
                      to={`/user/${place.firstContributorUserId}`}
                      className="tv-rec-by-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {place.firstContributorUsername}
                    </Link>
                  ) : (
                    place.firstContributorUsername
                  )}
                  {place.contributorCount > 1 && ` +${place.contributorCount - 1}`}
                </span>
              </span>
            </div>

            {isExpanded && (
              <div className="tv-rec-open-body">
                <TravelPlaceBubble
                  place={place}
                  currentUserId={currentUserId}
                  onEditContribution={onEditContribution}
                  onDeleteContribution={onDeleteContribution}
                  onAddOwn={onAddOwn}
                />
              </div>
            )}
          </li>
        );
      })}

      {!showAll && hiddenCount > 0 && (
        <li className="tv-rec-more">
          <button type="button" className="tv-rec-more-btn" onClick={() => setShowAll(true)}>
            show {hiddenCount} more
          </button>
        </li>
      )}
    </ul>
  );
}
