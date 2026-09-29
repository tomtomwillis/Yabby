import React, { useEffect, useMemo, useState } from 'react';
import { loadEventCities } from '../../utils/eventsApi';
import { cityKey, EVENT_LIMITS } from './eventTypes';
import './EventForm.css';

const MAX_SHOWN = 8;
// Fewer matches than this and a new city is offered alongside them.
const FEW = 4;

interface CityInputProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * A city picked from the ones already in use, or typed. The list narrows as
 * you type; when it runs short, the text itself is offered as a new city,
 * which is added to the list for everyone when the event is saved.
 */
const CityInput: React.FC<CityInputProps> = ({ value, onChange }) => {
  const [cities, setCities] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // Read once, the first time the box is used.
  useEffect(() => {
    if (!open || cities) return;
    loadEventCities()
      .then(setCities)
      .catch(() => setCities([]));
  }, [open, cities]);

  const typed = value.trim();
  const matches = useMemo(
    () => (cities ?? []).filter((city) => cityKey(city).includes(cityKey(typed))).slice(0, MAX_SHOWN),
    [cities, typed],
  );
  const exact = matches.some((city) => cityKey(city) === cityKey(typed));
  const offerNew = !!typed && !exact && matches.length < FEW;
  const rows = [...matches, ...(offerNew ? [typed] : [])];

  const choose = (city: string) => {
    onChange(city);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (rows.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + rows.length) % rows.length);
    } else if (e.key === 'Enter' && open && rows[active]) {
      e.preventDefault();
      choose(rows[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="ev-combo ev-city">
      <input
        className="ev-input"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        maxLength={EVENT_LIMITS.city}
        placeholder="pick or type a city"
        aria-label="City"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      <button
        type="button"
        className="ev-city-toggle"
        tabIndex={-1}
        aria-hidden="true"
        onMouseDown={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
      >
        ▾
      </button>
      {open && (
        <ul className="ev-suggest" role="listbox">
          {cities === null && <li className="ev-suggest-note">loading cities…</li>}
          {cities !== null && rows.length === 0 && <li className="ev-suggest-note">type a city to add it</li>}
          {rows.map((city, i) => {
            const isNew = offerNew && i === rows.length - 1;
            return (
              <li key={isNew ? '+new' : city} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={`ev-suggest-item${isNew ? ' ev-suggest-add' : ''}${i === active ? ' is-active' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(city);
                  }}
                  onMouseEnter={() => setActive(i)}
                >
                  {isNew ? `+ add “${city}” as a new city` : city}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default CityInput;
