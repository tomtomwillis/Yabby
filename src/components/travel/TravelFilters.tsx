import { useEffect, useRef, useState } from 'react';
import './TravelFilters.css';

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

export interface Facet {
  /** The lowercase word the bar reads as a key — "city", "category", "by". */
  key: string;
  /** The current selection; '' means the facet is unset. */
  value: string;
  options: FilterOption[];
  /** How many places survive the *other* facets — the count "all" carries. */
  allCount: number;
  onChange: (value: string) => void;
}

interface TravelFiltersProps {
  facets: Facet[];
  shown: number;
  total: number;
  onClear: () => void;
}

/**
 * The filter as a line of type rather than a panel of dropdowns: the word
 * `filter`, each facet stated as `key: value`, a hairline filling what is left,
 * and the count at the far end. Opening a facet unrolls an index of its values
 * beneath the bar, each on a dot leader with the number of places it would
 * leave — so the shape of the data is readable without choosing anything.
 */
export default function TravelFilters({ facets, shown, total, onClear }: TravelFiltersProps) {
  const [open, setOpen] = useState<string | null>(null);
  // The panel keeps drawing the facet that was last open while it rolls back
  // up, or closing one would empty the box before it had finished closing.
  const [drawn, setDrawn] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setDrawn(open);
  }, [open]);

  // The panel lies over the list below it, so it has to be dismissible without
  // choosing a value.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const hasActive = facets.some((f) => f.value !== '');
  const drawnFacet = facets.find((f) => f.key === drawn) ?? null;

  return (
    <div className="tv-filter" ref={rootRef}>
      <div className="tv-filter-bar">
        <span className="tv-filter-label">filter</span>

        {facets.map((facet) => {
          const selected = facet.options.find((o) => o.value === facet.value);
          const isOpen = open === facet.key;
          return (
            <button
              key={facet.key}
              type="button"
              className={`tv-facet${isOpen ? ' is-open' : ''}${facet.value ? ' is-set' : ''}`}
              aria-expanded={isOpen}
              onClick={() => setOpen((prev) => (prev === facet.key ? null : facet.key))}
            >
              <span className="tv-facet-key">{facet.key}:</span>
              <span className="tv-facet-val">{selected ? selected.label : 'all'}</span>
              <span className="tv-facet-mark" aria-hidden="true">
                ▸
              </span>
            </button>
          );
        })}

        <span className="tv-filter-rule" aria-hidden="true" />

        {hasActive && (
          <button
            type="button"
            className="tv-filter-clear"
            onClick={() => {
              setOpen(null);
              onClear();
            }}
          >
            clear
          </button>
        )}

        <span className="tv-filter-note">
          {hasActive ? `${shown} of ${total} places` : `${total} places`}
        </span>
      </div>

      <div className={`tv-filter-panel${open ? ' is-open' : ''}`}>
        <div className="tv-filter-panel-inner">
          {drawnFacet && (
            <ul className="tv-opts">
              {[{ value: '', label: 'all', count: drawnFacet.allCount }, ...drawnFacet.options].map(
                (option) => (
                  <li key={option.value || '*'}>
                    <button
                      type="button"
                      className={`tv-opt${drawnFacet.value === option.value ? ' is-sel' : ''}${
                        option.count === 0 ? ' is-empty' : ''
                      }`}
                      onClick={() => {
                        drawnFacet.onChange(option.value);
                        setOpen(null);
                      }}
                    >
                      <span className="tv-opt-name">{option.label}</span>
                      <span className="tv-opt-leader" aria-hidden="true" />
                      <span className="tv-opt-count">{option.count}</span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
