import { useEffect, useId, useState, type ReactNode } from 'react';
import type { Facet } from '../travel/TravelFilters';
import CalendarMine from './CalendarMine';
import './CalendarSettings.css';

interface CalendarSettingsProps {
  facets: Facet[];
  shown: number;
  total: number;
  /** The stretch the counts cover: "this month", "in november 2026". */
  period: string;
  onClear: () => void;
  /** Signed in — the member's own calendar settings go under the filters. */
  signedIn: boolean;
  onShowMine: () => void;
  open: boolean;
  onToggle: () => void;
  /** Its own cell to the left of the settings toggle — the page's "add an event". */
  lead?: ReactNode;
}

/** A category as the filter sentence reads it — "gigs in Glasgow". */
const TYPE_PLURALS: Record<string, string> = {
  gig: 'gigs',
  club: 'club nights',
  radio: 'radio shows',
  release: 'releases',
  event: 'events',
  other: 'other events',
};

/** The set filters as one phrase: "gigs in London posted by alice". Keys
 *  are the facet names CalendarPage gives. */
function describeFilters(active: Facet[]): string {
  const get = (key: string) => active.find((f) => f.key === key);
  const label = (f: Facet) => f.options.find((o) => o.value === f.value)?.label ?? f.value;
  const type = get('type');
  const city = get('city');
  const host = get('hosted by');
  const added = get('added by');
  const cal = get('calendar');
  return [
    type ? (TYPE_PLURALS[type.value] ?? label(type)) : 'events',
    city && `in ${label(city)}`,
    host && `hosted by ${label(host)}`,
    added && `posted by ${label(added)}`,
    cal && (cal.value === 'mine' ? 'in my calendar' : `in ${label(cal)}'s calendar`),
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * A line stating the filters and the count, then two cells — the page's "add
 * an event" and the settings toggle — over the filters and the member's own
 * calendar. The status line shows whatever filter is set even while closed:
 * they are remembered between visits, so a list narrowed last week must not
 * look like the whole calendar.
 */
export default function CalendarSettings({
  facets,
  shown,
  total,
  period,
  onClear,
  signedIn,
  onShowMine,
  open,
  onToggle,
  lead,
}: CalendarSettingsProps) {
  // CalendarMine fetches the feed link when it mounts, so it waits for the
  // first open — and then stays, so closing does not empty the panel mid-roll.
  const [opened, setOpened] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (open) setOpened(true);
  }, [open]);

  const active = facets.filter((f) => f.value !== '');
  const noun = total === 1 ? 'event' : 'events';

  return (
    <div className={`cal-set${open ? ' is-open' : ''}`}>
      <div className="cal-set-status">
        <div className="cal-set-status-line">
          <span className="cal-set-summary">
            {active.length > 0 ? (
              <>
                filtered by <b>{describeFilters(active)}</b>
              </>
            ) : (
              'no filters'
            )}
          </span>

          <span className="cal-set-rule" aria-hidden="true" />

          <span className="cal-set-note">{active.length > 0 ? `${shown} of ${total} ${noun} ${period}` : `${total} ${noun} ${period}`}</span>
        </div>

        <button type="button" className="cal-word cal-set-reset" disabled={active.length === 0} onClick={onClear}>
          reset filters
        </button>
      </div>

      <div className="cal-set-row">
        {lead && <div className="cal-set-lead">{lead}</div>}
        <div className="cal-set-bar">
          <button type="button" className="cal-set-toggle" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
            <span className="cal-bar-sym" aria-hidden="true">⚙</span>
            settings + filters
            <span className="cal-set-mark" aria-hidden="true">
              ▸
            </span>
          </button>
        </div>
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
