import React, { useLayoutEffect, useRef, useState } from 'react';
import { parseMessageHTML } from '../basic/messageText';
import type { CalendarEvent } from './eventTypes';
import './EventNotes.css';

/** Lines of description shown before "see more". */
const CLAMP_LINES = 6;

interface EventNotesProps {
  event: Pick<CalendarEvent, 'description' | 'comment' | 'username'>;
  /** The description's own class where it sits — the list's or the card's. */
  descClassName: string;
}

/**
 * An event's description, cut to a few lines with "see more" when it runs
 * longer, then the author's word on why they are interested. The description
 * goes through the board's sanitising parser so its @-tags work; the comment
 * is plain text.
 */
const EventNotes: React.FC<EventNotesProps> = ({ event, descClassName }) => {
  const descRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el || expanded) return;
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [event.description, expanded]);

  if (!event.description && !event.comment) return null;

  return (
    <>
      {event.description && (
        <div className="ev-notes-desc">
          <div
            ref={descRef}
            className={`${descClassName}${expanded ? '' : ' ev-clamped'}`}
            style={{ '--ev-clamp': CLAMP_LINES } as React.CSSProperties}
          >
            {parseMessageHTML(event.description)}
          </div>
          {(overflows || expanded) && (
            <button type="button" className="ev-more" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'see less' : 'see more'}
            </button>
          )}
        </div>
      )}
      {event.comment && (
        <div className="ev-comment">
          <span className="ev-comment-label">{event.username || 'the author'} says:</span>
          <p className="ev-comment-text">{event.comment}</p>
        </div>
      )}
    </>
  );
};

export default EventNotes;
