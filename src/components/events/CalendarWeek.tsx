import React from 'react';
import { InterestMark } from './InterestedCheck';
import { categoryColour, dayLabel, timeLabel, WEEKDAY_NAMES, weekDays, type CalendarEvent } from './eventTypes';
import './CalendarGrid.css';

interface CalendarWeekProps {
  /** Any day in the week to draw. */
  anchor: string;
  today: string;
  selected: string;
  openId: string | null;
  eventsByDate: Map<string, CalendarEvent[]>;
  /** Events the member has ticked, marked beside their time. */
  interested: ReadonlySet<string>;
  onSelect: (date: string) => void;
  onOpen: (event: CalendarEvent) => void;
}

/** Seven days side by side, each a list of time and name. Below the column
 *  breakpoint the days stack into rows instead. */
const CalendarWeek: React.FC<CalendarWeekProps> = ({
  anchor,
  today,
  selected,
  openId,
  eventsByDate,
  interested,
  onSelect,
  onOpen,
}) => (
  <div className="cal-week">
    {weekDays(anchor).map((day, i) => {
      const events = eventsByDate.get(day) ?? [];
      const classes = ['cal-wk-day', day === today && 'is-today', day === selected && 'is-sel']
        .filter(Boolean)
        .join(' ');

      return (
        <section key={day} className={classes} aria-label={dayLabel(day)}>
          <button type="button" className="cal-wk-head" onClick={() => onSelect(day)} aria-pressed={day === selected}>
            <span className="cal-wk-name">{WEEKDAY_NAMES[i]}</span>
            <span className="cal-wk-n">{Number(day.slice(8))}</span>
          </button>

          {events.length === 0 ? (
            <p className="cal-wk-empty" aria-label="nothing on">·</p>
          ) : (
            <ul className="cal-wk-list">
              {events.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    className={`cal-wk-ev${event.id === openId ? ' is-open' : ''}`}
                    style={{ '--ec-c': categoryColour(event.category) } as React.CSSProperties}
                    onClick={() => onOpen(event)}
                  >
                    <span className="cal-wk-time">
                      {interested.has(event.id) && <><InterestMark />{' '}</>}
                      {timeLabel(event) || 'all day'}
                    </span>
                    <span className="cal-wk-title">{event.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      );
    })}
  </div>
);

export default CalendarWeek;
