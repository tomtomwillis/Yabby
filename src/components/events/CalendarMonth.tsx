import React from 'react';
import { categoryColour, dayLabel, monthGrid, WEEKDAY_NAMES, type CalendarEvent } from './eventTypes';
import './CalendarGrid.css';

// More than this and the dots would run out of the cell; the rest is a count.
const MAX_DOTS = 6;

interface CalendarMonthProps {
  /** Any day in the month to draw. */
  anchor: string;
  today: string;
  selected: string;
  eventsByDate: Map<string, CalendarEvent[]>;
  /** Events the member has ticked, drawn with a ring. */
  interested: ReadonlySet<string>;
  onSelect: (date: string) => void;
}

/** The month as whole Monday-first weeks: a day number and a dot per event,
 *  coloured by category, ringed when it is in the member's calendar. Choosing
 *  a day lists it under the grid. */
const CalendarMonth: React.FC<CalendarMonthProps> = ({ anchor, today, selected, eventsByDate, interested, onSelect }) => {
  const month = anchor.slice(0, 7);

  return (
    <div className="cal-month">
      {WEEKDAY_NAMES.map((name) => (
        <span key={name} className="cal-wd" aria-hidden="true">{name}</span>
      ))}
      {monthGrid(anchor).map((day) => {
        const events = eventsByDate.get(day) ?? [];
        const classes = [
          'cal-day',
          day.slice(0, 7) !== month && 'is-out',
          day === today && 'is-today',
          day === selected && 'is-sel',
          events.length > 0 && 'has-events',
        ].filter(Boolean).join(' ');
        const count = events.length === 1 ? '1 event' : `${events.length || 'no'} events`;
        const mine = events.filter((event) => interested.has(event.id)).length;

        return (
          <button
            key={day}
            type="button"
            className={classes}
            onClick={() => onSelect(day)}
            aria-pressed={day === selected}
            aria-label={`${dayLabel(day)}, ${count}${mine ? `, ${mine} in your calendar` : ''}`}
          >
            <span className="cal-day-n">{Number(day.slice(8))}</span>
            <span className="cal-dots" aria-hidden="true">
              {events.slice(0, MAX_DOTS).map((event) => (
                <span
                  key={event.id}
                  className={`cal-dot${interested.has(event.id) ? ' is-mine' : ''}`}
                  style={{ '--ec-c': categoryColour(event.category) } as React.CSSProperties}
                  title={event.title}
                />
              ))}
              {events.length > MAX_DOTS && <span className="cal-dots-more">+{events.length - MAX_DOTS}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default CalendarMonth;
