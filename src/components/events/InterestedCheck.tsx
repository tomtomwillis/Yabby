import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebaseConfig';
import { toggleInterest, useEventInterests } from '../../utils/eventInterests';
import { getUserData } from '../../utils/userCache';
import { interestIn, type CalendarEvent } from './eventTypes';
import './InterestedCheck.css';

function useInterest(event: CalendarEvent) {
  const [user] = useAuthState(auth);
  const { ids, ready } = useEventInterests();
  return { ...interestIn(event, user?.uid ?? null, ids, ready), ready };
}

interface InterestedCheckProps {
  event: CalendarEvent;
  className?: string;
}

/** "[ ] interested? · 3 interested" — puts the event in the member's own
 *  calendar and counts them in; hovering the count names everyone who is. */
const InterestedCheck: React.FC<InterestedCheckProps> = ({ event, className }) => {
  const { checked, ready, count, userIds } = useInterest(event);
  const [failed, setFailed] = useState(false);
  // Where the names hang, fixed to the viewport: the row they sit in clips
  // anything that spills out of it.
  const [open, setOpen] = useState<React.CSSProperties | null>(null);
  const countRef = useRef<HTMLButtonElement>(null);
  const [names, setNames] = useState<{ key: string; list: string[] } | null>(null);
  const namesKey = userIds.join(',');

  const onChange = async () => {
    setFailed(false);
    try {
      const on = await toggleInterest(event);
      window.umami?.track('calendar_interest', { state: on ? 'on' : 'off' });
    } catch (error) {
      console.error('Could not save interest:', error);
      setFailed(true);
    }
  };

  const show = () => {
    const rect = countRef.current?.getBoundingClientRect();
    if (!rect) return;
    const top = rect.top + rect.height / 2;
    setOpen(
      rect.right + 240 < window.innerWidth
        ? { left: rect.right + 8, top }
        : { right: window.innerWidth - rect.left + 8, top },
    );
    if (names?.key === namesKey) return;
    // Through the shared profile cache: authors and posters are mostly in it already.
    Promise.all(userIds.map((id) => getUserData(id).then((p) => p.username)))
      .then((list) => setNames({ key: namesKey, list }))
      .catch(() => {});
  };

  return (
    <span className={`int-wrap${className ? ` ${className}` : ''}`}>
      <label className="int-check" title="adds it to your calendar, and counts you in">
        <input type="checkbox" checked={checked} disabled={!ready} onChange={onChange} />
        <span className="int-check-mark" aria-hidden="true">{checked ? '[x]' : '[ ]'}</span>
        interested?
      </label>
      {count > 0 && (
        <span className="int-count-wrap" onMouseEnter={show} onMouseLeave={() => setOpen(null)}>
          <button
            ref={countRef}
            type="button"
            className="int-count"
            aria-expanded={!!open}
            onFocus={show}
            onBlur={() => setOpen(null)}
            onClick={() => (open ? setOpen(null) : show())}
          >
            {count} interested
          </button>
          {open &&
            names?.key === namesKey &&
            names.list.length > 0 &&
            createPortal(
              <span className="int-names" role="tooltip" style={open}>
                {names.list.map((name, i) => (
                  <span key={userIds[i]}>{name}</span>
                ))}
              </span>,
              document.body,
            )}
        </span>
      )}
      {failed && <span className="int-check-error" role="alert">couldn't save, try again</span>}
    </span>
  );
};

/** The mark beside an event the member has ticked, wherever events are drawn. */
export const InterestMark: React.FC = () => (
  <span className="int-mark" role="img" aria-label="in your calendar" title="in your calendar">✓</span>
);

export default InterestedCheck;
