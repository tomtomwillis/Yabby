import React, { useState } from 'react';

const FLAG_OPTIONS: { flag: string; label: string }[] = [
  { flag: '', label: 'None' },
  { flag: '🇦🇷', label: 'Argentina' },
  { flag: '🇦🇺', label: 'Australia' },
  { flag: '🇦🇹', label: 'Austria' },
  { flag: '🇧🇩', label: 'Bangladesh' },
  { flag: '🇧🇪', label: 'Belgium' },
  { flag: '🇧🇷', label: 'Brazil' },
  { flag: '🇨🇦', label: 'Canada' },
  { flag: '🇨🇱', label: 'Chile' },
  { flag: '🇨🇳', label: 'China' },
  { flag: '🇨🇴', label: 'Colombia' },
  { flag: '🇨🇿', label: 'Czech Republic' },
  { flag: '🇩🇰', label: 'Denmark' },
  { flag: '🇪🇬', label: 'Egypt' },
  { flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', label: 'England' },
  { flag: '🇫🇮', label: 'Finland' },
  { flag: '🇫🇷', label: 'France' },
  { flag: '🇩🇪', label: 'Germany' },
  { flag: '🇬🇷', label: 'Greece' },
  { flag: '🇭🇺', label: 'Hungary' },
  { flag: '🇮🇳', label: 'India' },
  { flag: '🇮🇩', label: 'Indonesia' },
  { flag: '🇮🇪', label: 'Ireland' },
  { flag: '🇮🇱', label: 'Israel' },
  { flag: '🇮🇹', label: 'Italy' },
  { flag: '🇯🇵', label: 'Japan' },
  { flag: '🇰🇪', label: 'Kenya' },
  { flag: '🇰🇷', label: 'South Korea' },
  { flag: '🇲🇾', label: 'Malaysia' },
  { flag: '🇲🇽', label: 'Mexico' },
  { flag: '🇳🇱', label: 'Netherlands' },
  { flag: '🇳🇿', label: 'New Zealand' },
  { flag: '🇳🇬', label: 'Nigeria' },
  { flag: '🇳🇴', label: 'Norway' },
  { flag: '🇵🇰', label: 'Pakistan' },
  { flag: '🇵🇭', label: 'Philippines' },
  { flag: '🇵🇱', label: 'Poland' },
  { flag: '🇵🇹', label: 'Portugal' },
  { flag: '🇷🇴', label: 'Romania' },
  { flag: '🇷🇺', label: 'Russia' },
  { flag: '🇸🇦', label: 'Saudi Arabia' },
  { flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', label: 'Scotland' },
  { flag: '🇸🇬', label: 'Singapore' },
  { flag: '🇿🇦', label: 'South Africa' },
  { flag: '🇪🇸', label: 'Spain' },
  { flag: '🇸🇪', label: 'Sweden' },
  { flag: '🇨🇭', label: 'Switzerland' },
  { flag: '🇹🇭', label: 'Thailand' },
  { flag: '🇹🇷', label: 'Turkey' },
  { flag: '🇺🇦', label: 'Ukraine' },
  { flag: '🇬🇧', label: 'United Kingdom' },
  { flag: '🇺🇸', label: 'United States' },
  { flag: '🇻🇳', label: 'Vietnam' },
  { flag: '🏴󠁧󠁢󠁷󠁬󠁳󠁿', label: 'Wales' },
  { flag: '☘️', label: 'Ireland Shamrock' },
  { flag: '🏴‍☠️', label: 'Pirate' },
  { flag: '🏳️‍🌈', label: 'Rainbow' },
  { flag: '🌍', label: 'Globe Africa Europe' },
  { flag: '🌎', label: 'Globe Americas' },
  { flag: '🌏', label: 'Globe Asia' },
];

interface FlagPickerProps {
  value: string;
  onChange: (flag: string) => void;
}

/* The travel filter's facet: the value stated on the line, and an index of the
   alternatives unrolled under it in flow rather than dropped over the page. */
const FlagPicker: React.FC<FlagPickerProps> = ({ value, onChange }) => {
  const [flagSearch, setFlagSearch] = useState('');
  const [flagDropdownOpen, setFlagDropdownOpen] = useState(false);

  const filteredFlags = FLAG_OPTIONS.filter((opt) =>
    opt.label.toLowerCase().includes(flagSearch.toLowerCase())
  );
  const flagLabel = FLAG_OPTIONS.find((opt) => opt.flag === value)?.label ?? 'none';

  return (
    <div className="me-field me-flag">
      <span className="me-label">flag</span>
      <button
        type="button"
        className={`me-facet${flagDropdownOpen ? ' is-open' : ''}`}
        onClick={() => setFlagDropdownOpen(!flagDropdownOpen)}
        aria-expanded={flagDropdownOpen}
        aria-controls="me-flag-panel"
      >
        <span className="me-facet-glyph">{value || '🏳️'}</span>
        <span className="me-facet-val">{flagLabel.toLowerCase()}</span>
        <span className="me-facet-mark" aria-hidden="true">›</span>
      </button>

      <div
        id="me-flag-panel"
        className={`me-flag-panel${flagDropdownOpen ? ' is-open' : ''}`}
      >
        <div className="me-flag-panel-inner">
          <div className="me-flag-body">
            <input
              type="text"
              className="me-flag-search"
              placeholder="search…"
              value={flagSearch}
              onChange={(e) => setFlagSearch(e.target.value)}
              aria-label="Search countries"
            />

            {filteredFlags.length > 0 ? (
              <ul className="me-flag-opts">
                {filteredFlags.map((opt) => (
                  <li key={opt.label}>
                    <button
                      type="button"
                      className={`me-flag-opt${value === opt.flag ? ' is-sel' : ''}`}
                      onClick={() => {
                        onChange(opt.flag);
                        setFlagDropdownOpen(false);
                        setFlagSearch('');
                      }}
                    >
                      <span className="me-flag-opt-glyph">{opt.flag || '✕'}</span>
                      <span className="me-flag-opt-name">{opt.label.toLowerCase()}</span>
                      <span className="me-flag-opt-leader" aria-hidden="true"></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="me-flag-none">no matches.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlagPicker;
