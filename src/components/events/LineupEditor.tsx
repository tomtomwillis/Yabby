import React, { useEffect, useRef, useState } from 'react';
import { searchLibrary, type LibraryItem } from '../../utils/navidromeSearch';
import { EVENT_LIMITS, type LineupAct } from './eventTypes';
import './EventForm.css';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

interface LineupEditorProps {
  acts: LineupAct[];
  onChange: (acts: LineupAct[]) => void;
}

/**
 * The bill, one act at a time. "+ add an act" opens a search of the library:
 * picking an artist links the act to it, and anything else goes on as typed
 * with no link — Enter does the same, linking only an exact name match.
 */
const LineupEditor: React.FC<LineupEditorProps> = ({ acts, onChange }) => {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [results, setResults] = useState<LibraryItem[]>([]);
  const [searching, setSearching] = useState(false);
  // -1 is the "add as typed" row at the end.
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  const query = text.trim();

  useEffect(() => {
    if (query.length < MIN_QUERY) {
      setResults([]);
      setSearching(false);
      return;
    }
    const request = ++requestRef.current;
    setSearching(true);
    const timer = setTimeout(() => {
      searchLibrary(query, { artists: 5 })
        .then((items) => {
          if (request !== requestRef.current) return;
          setResults(items);
          setActive(-1);
        })
        .catch(() => {})
        .finally(() => {
          if (request === requestRef.current) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const full = acts.length >= EVENT_LIMITS.lineup;

  const add = (act: LineupAct) => {
    const name = act.name.trim().slice(0, EVENT_LIMITS.act);
    if (!name || full) return;
    onChange([...acts, act.artistId ? { name, artistId: act.artistId } : { name }]);
    setText('');
    setResults([]);
    setActive(-1);
    inputRef.current?.focus();
  };

  const addTyped = () => {
    // A name that is exactly an artist in the library gets its link anyway.
    const exact = results.find((r) => r.name.toLowerCase() === query.toLowerCase());
    add(exact ? { name: exact.name, artistId: exact.id } : { name: query });
  };

  const stopAdding = () => {
    setAdding(false);
    setText('');
    setResults([]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const rows = results.length + 1;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      // Rows are the results then "add as typed"; -1 stands for the last one.
      setActive((i) => {
        const index = i === -1 ? results.length : i;
        const next = (index + step + rows) % rows;
        return next === results.length ? -1 : next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!query) return;
      if (active >= 0 && results[active]) add({ name: results[active].name, artistId: results[active].id });
      else addTyped();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      stopAdding();
    }
  };

  const remove = (index: number) => onChange(acts.filter((_, i) => i !== index));

  return (
    <div className="ev-lineup-edit">
      {acts.length > 0 && (
        <ol className="ev-acts">
          {acts.map((act, i) => (
            <li key={`${i}-${act.name}`} className="ev-act">
              <span className="ev-act-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="ev-act-name">{act.name}</span>
              <span className="ev-act-kind">{act.artistId ? '♫ in the library' : 'no link'}</span>
              <button type="button" className="ev-url-remove" onClick={() => remove(i)} aria-label={`Remove ${act.name}`}>
                ×
              </button>
            </li>
          ))}
        </ol>
      )}

      {adding ? (
        <div className="ev-combo">
          <input
            ref={inputRef}
            className="ev-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              if (!query) setAdding(false);
            }}
            maxLength={EVENT_LIMITS.act}
            placeholder="search the library, or type a name"
            aria-label="Add an act"
            aria-autocomplete="list"
          />
          {query.length > 0 && (
            <ul className="ev-suggest" role="listbox">
              {searching && results.length === 0 && <li className="ev-suggest-note">searching the library…</li>}
              {results.map((item, i) => (
                <li key={item.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    className={`ev-suggest-item${i === active ? ' is-active' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      add({ name: item.name, artistId: item.id });
                    }}
                    onMouseEnter={() => setActive(i)}
                  >
                    <span className="ev-suggest-name">{item.name}</span>
                    <span className="ev-suggest-kind">artist</span>
                  </button>
                </li>
              ))}
              <li role="option" aria-selected={active === -1}>
                <button
                  type="button"
                  className={`ev-suggest-item ev-suggest-add${active === -1 ? ' is-active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTyped();
                  }}
                  onMouseEnter={() => setActive(-1)}
                >
                  + add “{query}”{results.some((r) => r.name.toLowerCase() === query.toLowerCase()) ? '' : ' without a link'}
                </button>
              </li>
            </ul>
          )}
          <button type="button" className="ev-url-add" onClick={stopAdding}>
            done
          </button>
        </div>
      ) : (
        !full && (
          <button type="button" className="ev-url-add" onClick={() => setAdding(true)}>
            + add an act
          </button>
        )
      )}
    </div>
  );
};

export default LineupEditor;
