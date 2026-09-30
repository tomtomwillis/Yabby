import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getEvent, eventImageUrl, peekEvent } from '../../utils/eventsApi';
import { validateUrl } from '../../utils/sanitise';
import EventLineup from './EventLineup';
import EventNotes from './EventNotes';
import InterestedCheck from './InterestedCheck';
import UsernameLink from '../basic/UsernameLink';
import {
  categoryColour,
  dayLabel,
  eventPath,
  linkLabel,
  timeLabel,
  whereLabel,
  zoneNote,
  type CalendarEvent,
} from './eventTypes';
import './eventCard.css';

interface EventCardBodyProps {
  eventId: string;
  onLightbox: (url: string) => void;
  /** Called once whatever the card will show has rendered — the event, or why
   *  there is none — so the frame can fit itself to it and then appear. */
  onContent?: (content: HTMLElement) => void;
  /** Closes the card. Following it to the calendar puts the same event on the
   *  page, so the card would only be in the way. */
  onClose?: () => void;
}

/** An event inside the album/artist card frame. What members wrote is rendered
 *  as text, apart from the description (see EventNotes). Links are drawn only
 *  when http(s). */
const EventCardBody: React.FC<EventCardBodyProps> = ({ eventId, onLightbox, onContent, onClose }) => {
  // Seeded from the cache, so an event already listed somewhere is drawn on the
  // card's first frame rather than after a "loading" one.
  const [event, setEvent] = useState<CalendarEvent | null | undefined>(() => peekEvent(eventId));
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (peekEvent(eventId) !== undefined) return;
    let cancelled = false;
    getEvent(eventId)
      .then((loaded) => { if (!cancelled) setEvent(loaded); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [eventId]);

  const settled = error || event !== undefined;
  useLayoutEffect(() => {
    if (settled && rootRef.current) onContent?.(rootRef.current);
  }, [settled, event, onContent]);

  if (error) return <p className="sp-status" ref={rootRef}>could not load event</p>;
  if (event === undefined) return <p className="sp-status">loading event…</p>;
  if (event === null) return <p className="sp-status" ref={rootRef}>this event has been removed</p>;

  const image = eventImageUrl(event.imageId);
  const when = timeLabel(event);
  const where = whereLabel(event);
  const zone = zoneNote(event);
  const urls = (event.urls ?? []).filter(validateUrl);

  return (
    <div className={image ? 'ec has-image' : 'ec'} ref={rootRef}>
      {image && (
        <button className="nc-cover ec-cover" onClick={() => onLightbox(image)} aria-label={`View ${event.title} image`}>
          <img src={image} alt="" draggable={false} />
        </button>
      )}

      <div className="ec-info">
        <span className="ec-cat" style={{ '--ec-c': categoryColour(event.category) } as React.CSSProperties}>
          <span className="ec-dot" aria-hidden="true" />
          {event.category}
        </span>
        <Link className="nc-title ec-title" to={eventPath(event.id)} onClick={onClose}>{event.title}</Link>

        <dl className="ec-facts">
          <dt>when</dt>
          <dd>{dayLabel(event.date)}{when ? `, ${when}` : ''}{zone ? ` (${zone})` : ''}</dd>
          {where && (
            <>
              <dt>where</dt>
              <dd>{where}</dd>
            </>
          )}
          {event.lineup && event.lineup.length > 0 && (
            <>
              <dt>lineup</dt>
              <dd><EventLineup acts={event.lineup} /></dd>
            </>
          )}
          {event.cost && (
            <>
              <dt>cost</dt>
              <dd>{event.cost}</dd>
            </>
          )}
          {event.username && (
            <>
              <dt>added by</dt>
              <dd><UsernameLink userId={event.userId || undefined} username={event.username} className="ec-author" /></dd>
            </>
          )}
        </dl>

        <EventNotes event={event} descClassName="ec-desc" />

        {urls.length > 0 && (
          <ul className="ec-links">
            {urls.map((url) => (
              <li key={url}>
                <a href={url} target="_blank" rel="noopener noreferrer">{linkLabel(url)}</a>
              </li>
            ))}
          </ul>
        )}

        <InterestedCheck event={event} className="ec-interest" />
        <Link className="ec-open" to={eventPath(event.id)} onClick={onClose}>open in the calendar →</Link>
      </div>
    </div>
  );
};

export default EventCardBody;
