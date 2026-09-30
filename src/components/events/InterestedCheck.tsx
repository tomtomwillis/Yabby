import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebaseConfig';
import { setEventStatus, useEventInterests } from '../../utils/eventInterests';
import { getUserData } from '../../utils/userCache';
import { attendanceIn, type CalendarEvent, type EventStatus } from './eventTypes';
import './InterestedCheck.css';

/** "3 interested" — hovering or focusing it names everyone counted. */
const WhoCount: React.FC<{ count: number; label: string; userIds: string[] }> = ({ count, label, userIds }) => {
  // Where the names hang, fixed to the viewport: the row they sit in clips
  // anything that spills out of it.
  const [open, setOpen] = useState<React.CSSProperties | null>(null);
  const countRef = useRef<HTMLButtonElement>(null);
  const [names, setNames] = useState<{ key: string; list: string[] } | null>(null);
  const namesKey = userIds.join(',');

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

  if (count <= 0) return null;
  return (
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
        {count} {label}
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
  );
};

interface InterestedCheckProps {
  event: CalendarEvent;
  className?: string;
}

/** "[ ] interested?  [ ] going · 3 interested · 1 going" — either tick puts
 *  the event in the member's own calendar and counts them in. The two exclude
 *  each other; ticking the one already ticked clears it. */
const InterestedCheck: React.FC<InterestedCheckProps> = ({ event, className }) => {
  const [user] = useAuthState(auth);
  const mine = useEventInterests();
  const { status, interested, going } = attendanceIn(event, user?.uid ?? null, mine);
  const [failed, setFailed] = useState(false);

  const choose = async (which: EventStatus) => {
    const next = status === which ? null : which;
    setFailed(false);
    try {
      await setEventStatus(event, next);
      window.umami?.track('calendar_interest', { state: next ?? 'off' });
    } catch (error) {
      console.error('Could not save interest:', error);
      setFailed(true);
    }
  };

  return (
    <span className={`int-wrap${className ? ` ${className}` : ''}`}>
      <label className="int-check" title="adds it to your calendar, and counts you in">
        <input
          type="checkbox"
          checked={status === 'interested'}
          disabled={!mine.ready}
          onChange={() => choose('interested')}
        />
        <span className="int-check-mark" aria-hidden="true">{status === 'interested' ? '[x]' : '[ ]'}</span>
        interested?
      </label>
      <label className="int-check" title="you've got a ticket — adds it to your calendar, and counts you in">
        <input type="checkbox" checked={status === 'going'} disabled={!mine.ready} onChange={() => choose('going')} />
        <span className="int-check-mark" aria-hidden="true">{status === 'going' ? '[x]' : '[ ]'}</span>
        going (got ticket)
      </label>
      <WhoCount count={interested.count} label="interested" userIds={interested.userIds} />
      <WhoCount count={going.count} label="going" userIds={going.userIds} />
      {failed && <span className="int-check-error" role="alert">couldn't save, try again</span>}
    </span>
  );
};

/** The mark beside an event the member has ticked, wherever events are drawn:
 *  ✓ when interested, ☻ when going. */
export const InterestMark: React.FC<{ going?: boolean }> = ({ going = false }) => {
  const label = going ? "you're going" : 'in your calendar';
  return (
    <span className="int-mark" role="img" aria-label={label} title={label}>
      {going ? '☻' : '✓'}
    </span>
  );
};

export default InterestedCheck;
