import { useState } from 'react';
import type { Place, PlaceCategory, TravelPhoto } from './travelTypes';
import TravelPlaceBubble from './TravelPlaceBubble';
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
}

const PAGE_SIZE = 20;

export default function TravelRecommendationList({
  places,
  currentUserId,
  onFocus,
  onEditContribution,
  onDeleteContribution,
}: TravelRecommendationListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
            <button
              type="button"
              className="travel-rec-list__row"
              onClick={() => toggleExpand(place)}
              aria-expanded={isExpanded}
            >
              <div className="travel-rec-list__avatars">
                {place.firstContributorAvatar ? (
                  <img
                    className="travel-rec-list__avatar"
                    src={place.firstContributorAvatar}
                    alt={place.firstContributorUsername}
                  />
                ) : (
                  <div className="travel-rec-list__avatar travel-rec-list__avatar--fallback" />
                )}
                {place.contributorCount > 1 && (
                  <span className="travel-rec-list__extra-count">+{place.contributorCount - 1}</span>
                )}
              </div>

              <div className="travel-rec-list__meta">
                <span className="travel-rec-list__name">{place.displayName.split(',')[0]}</span>
                <span className="travel-rec-list__byline">
                  {place.firstContributorUsername}
                  {place.contributorCount > 1 && ` + ${place.contributorCount - 1} more`}
                  {place.city ? ` · ${place.city}` : ''}
                </span>
              </div>

              <span className={`travel-rec-list__chevron${isExpanded ? ' travel-rec-list__chevron--open' : ''}`}>
                ▾
              </span>
            </button>

            {isExpanded && (
              <div className="travel-rec-list__expanded">
                <TravelPlaceBubble
                  place={place}
                  currentUserId={currentUserId}
                  onEditContribution={onEditContribution}
                  onDeleteContribution={onDeleteContribution}
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
