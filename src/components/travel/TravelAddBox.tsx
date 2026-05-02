import { useEffect, useRef, useState } from 'react';
import { searchPlaces, type PlaceSearchResult } from '../../utils/geocode';
import './TravelAddBox.css';

interface TravelAddBoxProps {
  onPick: (result: PlaceSearchResult) => void;
  placeholder?: string;
  /** Bias search toward this map view (forwarded to Photon as lat/lon/zoom). */
  bias?: { lat: number; lng: number; zoom?: number };
}

export default function TravelAddBox({ onPick, placeholder, bias }: TravelAddBoxProps) {
  const [value, setValue] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [status, setStatus] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

  // Hold the latest bias in a ref so it doesn't re-trigger the debounce effect
  // on every map pan — we only read it at search-dispatch time.
  const biasRef = useRef(bias);
  biasRef.current = bias;

  useEffect(() => {
    const q = value.trim();
    if (q.length < 3) {
      setResults([]);
      setStatus('');
      return;
    }

    setStatus('Searching…');
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const b = biasRef.current;
        const hits = await searchPlaces(q, controller.signal, {
          lat: b?.lat,
          lon: b?.lng,
          zoom: b?.zoom,
        });
        if (controller.signal.aborted) return;
        setResults(hits);
        setStatus(hits.length === 0 ? 'No places found' : '');
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setStatus('Search failed');
        setResults([]);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const handlePick = (r: PlaceSearchResult) => {
    onPick(r);
    setValue('');
    setResults([]);
    setStatus('');
  };

  return (
    <div className="travel-add-box">
      <input
        type="text"
        className="travel-add-box__input"
        placeholder={placeholder ?? 'Search for a place to recommend…'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      {status && <p className="travel-add-box__status">{status}</p>}
      {results.length > 0 && (
        <ul className="travel-add-box__results">
          {results.map((r) => (
            <li key={`${r.osm_type}_${r.osm_id}`}>
              <button
                type="button"
                className="travel-add-box__result"
                onClick={() => handlePick(r)}
              >
                <span className="travel-add-box__result-name">{r.display_name.split(',')[0]}</span>
                <span className="travel-add-box__result-detail">{r.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
