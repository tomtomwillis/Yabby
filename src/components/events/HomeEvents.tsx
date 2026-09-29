import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadEventsInRange } from '../../utils/eventsApi';
import { useNavidromeCard } from '../../utils/useNavidromeCard';
import { useEventInterests } from '../../utils/eventInterests';
import { InterestMark } from './InterestedCheck';
import {
  addDays,
  categoryColour,
  dayLabel,
  eventPath,
  timeLabel,
  todayISO,
  weekRangeLabel,
  type CalendarEvent,
} from './eventTypes';
import './HomeEvents.css';

const MAX_PER_DAY = 3;

/** "mon 28" */
const shortDay = (iso: string) => dayLabel(iso).split(' ').slice(0, 2).join(' ');

interface HomeEventsNavProps {
  weekStart: string;
  onStep: (direction: -1 | 1) => void;
}

/** ‹ 28 sep – 4 oct › — sits at the right-hand end of the section heading. */
export const HomeEventsNav: React.FC<HomeEventsNavProps> = ({ weekStart, onStep }) => (
  <span className="he-nav">
    <button
      type="button"
      className="hp-af he-nav-step"
      onClick={() => onStep(-1)}
      aria-label="Previous week"
    >
      ‹
    </button>
    <span className="he-nav-range">{weekRangeLabel(weekStart)}</span>
    <button
      type="button"
      className="hp-af he-nav-step"
      onClick={() => onStep(1)}
      aria-label="Next week"
    >
      ›
    </button>
  </span>
);

interface HomeEventsProps {
  /** Monday of the week to show. */
  weekStart: string;
}

/**
 * A week at a glance, Monday to Sunday: a column per day, each event as its
 * time and name with the category down its side. Hovering one shows the same
 * card the board's Event Bot posts do, and clicking pins it — the card links
 * on to the calendar. One range query per week, shared with the calendar page
 * through the events cache.
 */
const HomeEvents: React.FC<HomeEventsProps> = ({ weekStart }) => {
  const today = useMemo(todayISO, []);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  // Keyed by the week it belongs to, so the last week stays drawn (dimmed)
  // while the next one loads instead of the grid collapsing to a message.
  const [loaded, setLoaded] = useState<{ weekStart: string; events: CalendarEvent[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const { open, close } = useNavidromeCard();
  const { ids: interested } = useEventInterests();

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    loadEventsInRange(days[0], days[6])
      .then((events) => {
        if (!cancelled) setLoaded({ weekStart, events });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [days, weekStart]);

  const current = loaded?.weekStart === weekStart ? loaded.events : null;

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of current ?? []) {
      const list = map.get(event.date);
      if (list) list.push(event);
      else map.set(event.date, [event]);
    }
    return map;
  }, [current]);

  if (failed) return <p className="hp-note">couldn't reach the calendar.</p>;
  if (!loaded) return <p className="hp-note">checking the calendar…</p>;

  return (
    <div className={`home-events${current ? '' : ' is-loading'}`}>
      <div className="he-week">
        {days.map((day) => {
          const list = byDate.get(day) ?? [];
          const classes = ['he-day', day === today && 'is-today', list.length === 0 && 'is-empty']
            .filter(Boolean)
            .join(' ');
          return (
            <div key={day} className={classes}>
              <span className="he-day-name">{shortDay(day)}</span>
              {list.length === 0 ? (
                <span className="he-none" aria-label="nothing on">·</span>
              ) : (
                <ul className="he-list">
                  {list.slice(0, MAX_PER_DAY).map((event) => {
                    const target = { type: 'event' as const, id: event.id };
                    return (
                      <li key={event.id}>
                        <Link
                          className="he-ev"
                          to={eventPath(event.id)}
                          style={{ '--ec-c': categoryColour(event.category) } as React.CSSProperties}
                          onMouseEnter={(e) => open({ target, at: { x: e.clientX, y: e.clientY }, pinned: false, follow: true })}
                          onMouseLeave={() => close(target)}
                          onClick={(e) => {
                            // A modified click still opens the calendar, in a new tab or here.
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                            e.preventDefault();
                            window.umami?.track('home_calendar_event', { id: event.id });
                            open({ target, at: { x: e.clientX, y: e.clientY }, pinned: true, follow: false });
                          }}
                        >
                          <span className="he-time">
                            {interested.has(event.id) && <><InterestMark />{' '}</>}
                            {timeLabel(event) || 'all day'}
                          </span>
                          <span className="he-title">{event.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                  {list.length > MAX_PER_DAY && (
                    <li>
                      <Link className="he-more" to={eventPath(list[MAX_PER_DAY].id)}>
                        +{list.length - MAX_PER_DAY} more
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {current && current.length === 0 && (
        <p className="he-empty">
          nothing on yet. <Link to="/calendar">add something?</Link>
        </p>
      )}
    </div>
  );
};

export default HomeEvents;
