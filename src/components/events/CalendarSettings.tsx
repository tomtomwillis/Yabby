import { useId, useState } from 'react';
import type { Facet } from '../travel/TravelFilters';
import CalendarMine from './CalendarMine';
import './CalendarSettings.css';

function track(event: string, data?: Record<string, string>) {
  try {
    window.umami?.track?.(event, data);
  } catch {
    /* ignore umami errors */
  }
}

interface CalendarSettingsProps {
  facets: Facet[];
  shown: number;
  total: number;
  onClear: () => void;
  /** Signed in — the member's own calendar settings go under the filters. */
  signedIn: boolean;
  onShowMine: () => void;
}

/**
 * The filters and the member's own calendar behind one line. Closed, the line
 * still states whatever filter is set — they are remembered between visits,
 * so a list narrowed last week must not look like the whole calendar.
 */
export default function CalendarSettings({
  facets,
  shown,
  total,
  onClear,
  signedIn,
  onShowMine,
}: CalendarSettingsProps) {
  const [open, setOpen] = useState(false);
  // CalendarMine fetches the feed link when it mounts, so it waits for the
  // first open — and then stays, so closing does not empty the panel mid-roll.
  const [opened, setOpened] = useState(false);
  const panelId = useId();

  const active = facets.filter((f) => f.value !== '');
  const noun = total === 1 ? 'event' : 'events';

  const toggle = () => {
    if (!open) {
      setOpened(true);
      track('calendar_settings_open');
    }
    setOpen(!open);
  };

  return (
    <div className={`cal-set${open ? ' is-open' : ''}`}>
      <div className="cal-set-bar">
        <button type="button" className="cal-set-toggle" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
          settings + filters
          <span className="cal-set-mark" aria-hidden="true">
            ▸
          </span>
        </button>

        {active.map((facet) => (
          <span key={facet.key} className="cal-set-chip">
            {facet.key}: <b>{facet.options.find((o) => o.value === facet.value)?.label ?? facet.value}</b>
          </span>
        ))}

        <span className="cal-set-rule" aria-hidden="true" />

        {active.length > 0 && (
          <button type="button" className="cal-word" onClick={onClear}>
            clear
          </button>
        )}

        <span className="cal-set-note">{active.length > 0 ? `${shown} of ${total} ${noun}` : `${total} ${noun}`}</span>
      </div>

      <div id={panelId} className="cal-set-panel">
        <div className="cal-set-panel-inner">
          <div className="cal-set-facets">
            {facets.map((facet) => (
              <div key={facet.key} className="cal-set-facet" role="group" aria-label={facet.key}>
                <h3 className="cal-set-facet-h">{facet.key}</h3>
                <ul className="cal-set-opts">
                  {[{ value: '', label: 'all', count: facet.allCount }, ...facet.options].map((option) => (
                    <li key={option.value || '*'}>
                      <button
                        type="button"
                        className={`cal-set-opt${facet.value === option.value ? ' is-sel' : ''}${
                          option.count === 0 ? ' is-empty' : ''
                        }`}
                        aria-pressed={facet.value === option.value}
                        onClick={() => facet.onChange(option.value)}
                      >
                        {option.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {signedIn && opened && <CalendarMine onShowMine={onShowMine} />}
        </div>
      </div>
    </div>
  );
}
