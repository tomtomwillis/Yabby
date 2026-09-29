import React, { useEffect, useRef, useState } from 'react';
import { navidromeHref, searchLibrary, type LibraryItem } from '../../utils/navidromeSearch';
import './EventForm.css';

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

/** An @ that starts a word, and what has been typed after it up to the caret. */
function findTrigger(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1 || (at > 0 && !/\s/.test(value[at - 1]))) return null;
  const query = before.slice(at + 1);
  if (/\n/.test(query) || query.length > 40) return null;
  return { start: at, query };
}

interface TagTextareaProps {
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
}

/**
 * A textarea that tags the library the way the board's composer does: type @
 * and a couple of letters, pick an artist or album, and it is written in as
 * [Name](navidrome link) — which the calendar and the event card render as a
 * hover card.
 */
const TagTextarea: React.FC<TagTextareaProps> = ({ value, onChange, maxLength, placeholder }) => {
  const [trigger, setTrigger] = useState<{ start: number; query: string } | null>(null);
  const [results, setResults] = useState<LibraryItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'done'>('idle');
  const [active, setActive] = useState(0);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef(0);

  const query = trigger?.query ?? '';

  useEffect(() => {
    if (query.length < MIN_QUERY) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const request = ++requestRef.current;
    setStatus('searching');
    const timer = setTimeout(() => {
      searchLibrary(query, { artists: 4, albums: 4 })
        .then((items) => {
          if (request !== requestRef.current) return;
          setResults(items);
          setActive(0);
          setStatus('done');
        })
        .catch(() => {
          if (request === requestRef.current) setStatus('done');
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const open = !!trigger && query.length >= MIN_QUERY;

  const update = (next: string, caret: number) => {
    onChange(next);
    setTrigger(findTrigger(next, caret));
  };

  const close = () => setTrigger(null);

  const select = (item: LibraryItem) => {
    const area = areaRef.current;
    if (!trigger || !area) return;
    const name = item.name.replace(/[[\]]/g, '');
    const tag = `[${name}](${navidromeHref(item.type, item.id)}) `;
    const caret = area.selectionStart;
    const next = value.slice(0, trigger.start) + tag + value.slice(caret);
    close();
    if (next.length > maxLength) return;
    onChange(next);
    const at = trigger.start + tag.length;
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(at, at);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open || results.length === 0) {
      if (e.key === 'Escape' && trigger) close();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + results.length) % results.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      select(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className="ev-combo">
      <textarea
        ref={areaRef}
        className="ev-input ev-textarea"
        value={value}
        onChange={(e) => update(e.target.value, e.target.selectionStart)}
        onKeyDown={onKeyDown}
        onClick={(e) => setTrigger(findTrigger(value, e.currentTarget.selectionStart))}
        onBlur={close}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && (
        <ul className="ev-suggest" role="listbox">
          {status === 'searching' && results.length === 0 && <li className="ev-suggest-note">searching the library…</li>}
          {status === 'done' && results.length === 0 && <li className="ev-suggest-note">nothing in the library called that</li>}
          {results.map((item, i) => (
            <li key={`${item.type}-${item.id}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`ev-suggest-item${i === active ? ' is-active' : ''}`}
                // Before the textarea's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  select(item);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="ev-suggest-name">{item.name}</span>
                <span className="ev-suggest-kind">{item.type === 'album' && item.artist ? `album · ${item.artist}` : item.type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TagTextarea;
