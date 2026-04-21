import { useEffect, useRef, useState } from 'react';
import { searchNominatim, type NominatimResult } from '../../utils/nominatim';
import './TravelAddBox.css';

interface TravelAddBoxProps {
  onPick: (result: NominatimResult) => void;
  placeholder?: string;
}

export default function TravelAddBox({ onPick, placeholder }: TravelAddBoxProps) {
  const [value, setValue] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [status, setStatus] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);

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
        const hits = await searchNominatim(q, controller.signal);
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

  const handlePick = (r: NominatimResult) => {
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
            <li key={`${r.osm_type}_${r.osm_id}_${r.place_id}`}>
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
