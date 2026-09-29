import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicFeedLink, googleCalendarLink, webcalLink } from '../../utils/eventInterests';

interface ProfileCalendarProps {
  userId: string;
  /** They let members view their calendar on the site. */
  viewable: boolean;
  /** They show their feed link on their profile. */
  subscribable: boolean;
}

/** A member's calendar on their profile: a link to it on the calendar page,
 *  and their feed to subscribe to. The feed address is only asked for on a
 *  click, since the backend reads their profile afresh to check they still
 *  share it. */
const ProfileCalendar: React.FC<ProfileCalendarProps> = ({ userId, viewable, subscribable }) => {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reveal = async () => {
    setBusy(true);
    setError(null);
    try {
      setLink(await getPublicFeedLink(userId));
      window.umami?.track('profile_calendar_subscribe');
    } catch (err) {
      setError(((err as Error).message || 'Could not get that calendar link.').toLowerCase());
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="up-cal">
      {viewable && <Link to={`/calendar?cal=${encodeURIComponent(userId)}`}>see what they're into</Link>}
      {viewable && subscribable && ' · '}
      {subscribable && !link && (
        <button type="button" className="up-cal-sub" onClick={reveal} disabled={busy}>
          {busy ? 'getting link…' : 'subscribe'}
        </button>
      )}
      {link && (
        <>
          <a href={webcalLink(link)}>apple / outlook</a>
          {' · '}
          <a href={googleCalendarLink(link)} target="_blank" rel="noopener noreferrer">google</a>
          {' · '}
          <input
            className="up-cal-url"
            type="text"
            readOnly
            value={link}
            aria-label="Calendar link"
            onFocus={(e) => e.currentTarget.select()}
          />
        </>
      )}
      {error && <span className="up-cal-error"> {error}</span>}
    </span>
  );
};

export default ProfileCalendar;
