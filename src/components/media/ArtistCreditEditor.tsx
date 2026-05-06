import React from 'react';
import './ArtistCreditEditor.css';

export interface ArtistCredit {
  name: string;
  joinPhrase: string;
}

export const JOIN_PHRASES: string[] = [
  ', ',
  ' & ',
  ' and ',
  ' feat. ',
  ' with ',
  ' vs. ',
  ' presents ',
  ' x ',
  ' / ',
];

export const DEFAULT_JOIN_PHRASE = ' / ';

interface Props {
  value: ArtistCredit[];
  onChange: (next: ArtistCredit[]) => void;
  ariaLabel?: string;
}

const ArtistCreditEditor: React.FC<Props> = ({ value, onChange, ariaLabel }) => {
  const credits = value.length === 0
    ? [{ name: '', joinPhrase: DEFAULT_JOIN_PHRASE }]
    : value;

  const updateAt = (index: number, patch: Partial<ArtistCredit>) => {
    const next = credits.map((c, i) => (i === index ? { ...c, ...patch } : c));
    onChange(next);
  };

  const removeAt = (index: number) => {
    if (credits.length <= 1) {
      onChange([{ name: '', joinPhrase: DEFAULT_JOIN_PHRASE }]);
      return;
    }
    onChange(credits.filter((_, i) => i !== index));
  };

  const addArtist = () => {
    onChange([...credits, { name: '', joinPhrase: DEFAULT_JOIN_PHRASE }]);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= credits.length) return;
    const next = [...credits];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="artist-credit" role="group" aria-label={ariaLabel}>
      {credits.map((credit, i) => {
        const isLast = i === credits.length - 1;
        return (
          <div className="artist-credit__row" key={i}>
            <input
              type="text"
              className="artist-credit__name"
              value={credit.name}
              onChange={(e) => updateAt(i, { name: e.target.value })}
              placeholder="Artist name"
              maxLength={256}
            />
            {!isLast && (
              <select
                className="artist-credit__join"
                value={credit.joinPhrase}
                onChange={(e) => updateAt(i, { joinPhrase: e.target.value })}
                aria-label="Join phrase"
              >
                {JOIN_PHRASES.map((p) => (
                  <option key={p} value={p}>{p.trim() || ','}</option>
                ))}
              </select>
            )}
            <div className="artist-credit__controls">
              <button
                type="button"
                className="artist-credit__btn"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Move up"
                title="Move up"
              >↑</button>
              <button
                type="button"
                className="artist-credit__btn"
                onClick={() => move(i, 1)}
                disabled={isLast}
                aria-label="Move down"
                title="Move down"
              >↓</button>
              <button
                type="button"
                className="artist-credit__btn artist-credit__btn--remove"
                onClick={() => removeAt(i)}
                aria-label="Remove"
                title="Remove"
              >×</button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="artist-credit__add"
        onClick={addArtist}
      >
        + Add artist
      </button>
    </div>
  );
};

export default ArtistCreditEditor;
