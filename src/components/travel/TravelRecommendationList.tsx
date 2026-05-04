import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Place, PlaceCategory, TravelPhoto } from './travelTypes';
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
    return <p className="travel-rec-list__empty">No recommendations match the current filters.</p>;
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
    <ul className="travel-rec-list">
      {visible.map((place) => {
        const isExpanded = expandedId === place.id;
        return (
          <li key={place.id} className={`travel-rec-list__item${isExpanded ? ' travel-rec-list__item--expanded' : ''}`}>
            <div
              role="button"
              tabIndex={0}
              className="travel-rec-list__row"
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
              <div className="travel-rec-list__avatars">
                {place.contributorCount >= 2 ? (
                  <img
                    className="travel-rec-list__avatar"
                    src="/Stickers/avatar_star_pink.webp"
                    alt=""
                  />
                ) : place.firstContributorAvatar ? (
                  <img
                    className="travel-rec-list__avatar"
                    src={normalizeAvatarPath(place.firstContributorAvatar)}
                    alt={place.firstContributorUsername}
                  />
                ) : (
                  <div className="travel-rec-list__avatar travel-rec-list__avatar--fallback" />
                )}
              </div>

              <div className="travel-rec-list__meta">
                <span className="travel-rec-list__name">{place.displayName.split(',')[0]}</span>
                <span className="travel-rec-list__byline">
                  {place.firstContributorUserId ? (
                    <Link
                      to={`/user/${place.firstContributorUserId}`}
                      className="travel-rec-list__byline-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {place.firstContributorUsername}
                    </Link>
                  ) : (
                    place.firstContributorUsername
                  )}
                  {place.contributorCount > 1 && ` + ${place.contributorCount - 1} more`}
                  {place.city ? ` · ${place.city}` : ''}
                </span>
              </div>

              <span className={`travel-rec-list__chevron${isExpanded ? ' travel-rec-list__chevron--open' : ''}`}>
                ▾
              </span>
            </div>

            {isExpanded && (
              <div className="travel-rec-list__expanded">
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
        <li className="travel-rec-list__show-more">
          <button type="button" className="travel-rec-list__show-more-btn" onClick={() => setShowAll(true)}>
            Show {hiddenCount} more
          </button>
        </li>
      )}
    </ul>
  );
}
