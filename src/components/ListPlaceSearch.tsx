import { useEffect, useState } from 'react';
import { listPlaces } from '../api/areas/travel';
import { listablePlaces, searchListPlaces, type ListPlace } from '../utils/listPlaces';

interface ListPlaceSearchProps {
  onSelect: (place: ListPlace) => void;
}

export default function ListPlaceSearch({ onSelect }: ListPlaceSearchProps) {
  const [places, setPlaces] = useState<ListPlace[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    listPlaces().then((docs) => {
      if (active) setPlaces(listablePlaces(docs));
    }).catch((err) => {
      console.error('Could not load travel locations:', err);
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [attempt]);

  const matches = searchListPlaces(places, search);

  return (
    <div className="ls-form-place-search">
      <label className="ls-form-label" htmlFor="ls-form-place-search">search travel locations</label>
      <input
        id="ls-form-place-search"
        className="ls-form-input"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="name, city or country"
      />
      {loading && <p className="ls-form-note" role="status">loading locations…</p>}
      {error && (
        <p className="ls-form-error" role="alert">
          could not load travel locations.{' '}
          <button type="button" className="ls-form-quiet" onClick={() => setAttempt((n) => n + 1)}>try again</button>
        </p>
      )}
      {!loading && !error && search.trim() && matches.length === 0 && (
        <p className="ls-form-note">no locations match.</p>
      )}
      {!loading && !error && matches.length > 0 && (
        <ul className="ls-form-place-results">
          {matches.slice(0, 20).map((place) => (
            <li key={place.id}>
              <button type="button" onClick={() => onSelect(place)}>
                {place.name}{[place.city, place.country].filter(Boolean).map((part) => ` · ${part}`)}
              </button>
            </li>
          ))}
          {matches.length > 20 && <li className="ls-form-note">showing 20 of {matches.length}; refine your search.</li>}
        </ul>
      )}
    </div>
  );
}
