import React, { useEffect, useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebaseConfig';
import {
  getFeedLink,
  googleCalendarLink,
  resetFeedLink,
  setCalendarSharing,
  useEventInterests,
  webcalLink,
} from '../../utils/eventInterests';
import { getUserProfile } from '../../utils/userCache';
import './CalendarMine.css';

function track(event: string, data?: Record<string, string>) {
  try {
    window.umami?.track?.(event, data);
  } catch {
    /* ignore umami errors */
  }
}

type Sharing = { calendarPublic: boolean; calendarFeedPublic: boolean };

interface CalendarMineProps {
  /** Turns the page's filter to the member's own events. */
  onShowMine: () => void;
}

/** The member's own calendar: who else may see it, the address to subscribe
 *  to with one-click links for the common apps, and a way to retire the
 *  address if it leaks. */
const CalendarMine: React.FC<CalendarMineProps> = ({ onShowMine }) => {
  const [user] = useAuthState(auth);
  const { ids } = useEventInterests();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [wasReset, setWasReset] = useState(false);
  const [sharing, setSharing] = useState<Sharing | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFeedLink()
      .then((url) => {
        if (!cancelled) setLink(url);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message.toLowerCase());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getUserProfile(user.uid)
      .then((profile) => {
        if (!cancelled) setSharing({ calendarPublic: profile.calendarPublic, calendarFeedPublic: profile.calendarFeedPublic });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const share = async (key: keyof Sharing, on: boolean) => {
    if (!sharing) return;
    const before = sharing;
    setSharing({ ...sharing, [key]: on });
    setSaving(true);
    setError(null);
    try {
      await setCalendarSharing({ [key]: on });
      track('calendar_sharing', { setting: key, state: on ? 'on' : 'off' });
    } catch (err) {
      console.error('Could not save calendar sharing:', err);
      setSharing(before);
      setError('could not save that. try again in a moment.');
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      track('calendar_subscribe_copy');
    } catch {
      setError('could not copy — select the link and copy it by hand.');
    }
  };

  const reset = async () => {
    const warning = sharing?.calendarFeedPublic
      ? 'Make a new link? The old one stops working, so anywhere you subscribed with it will need the new one. Your profile will show the new one.'
      : 'Make a new link? The old one stops working, so anywhere you subscribed with it will need the new one.';
    if (!window.confirm(warning)) return;
    setResetting(true);
    setError(null);
    try {
      setLink(await resetFeedLink());
      setWasReset(true);
      track('calendar_feed_reset');
    } catch (err) {
      console.error('Could not reset the calendar link:', err);
      setError('could not make a new link. try again in a moment.');
    } finally {
      setResetting(false);
    }
  };

  const count = ids.size === 1 ? '1 event' : `${ids.size} events`;

  return (
    <section className="cal-sub" aria-label="Your calendar">
      <p className="cal-sub-text">
        tick <b>interested?</b> on any event and it goes in your calendar. you have {count} ticked
        {ids.size > 0 && (
          <>
            {' — '}
            <button type="button" className="cal-inline" onClick={onShowMine}>
              show them
            </button>
          </>
        )}
        .
      </p>

      <div className="cal-sub-opts">
        <label className="cal-check">
          <input
            type="checkbox"
            checked={!!sharing?.calendarPublic}
            disabled={!sharing || saving}
            onChange={(e) => share('calendarPublic', e.target.checked)}
          />
          <span className="cal-check-mark" aria-hidden="true">{sharing?.calendarPublic ? '[x]' : '[ ]'}</span>
          members can view my calendar
          <span className="cal-sub-hint">anyone can pick you in the calendar filter to see what you're going to</span>
        </label>
        <label className="cal-check">
          <input
            type="checkbox"
            checked={!!sharing?.calendarFeedPublic}
            disabled={!sharing || saving}
            onChange={(e) => share('calendarFeedPublic', e.target.checked)}
          />
          <span className="cal-check-mark" aria-hidden="true">{sharing?.calendarFeedPublic ? '[x]' : '[ ]'}</span>
          show my calendar link on my profile
          <span className="cal-sub-hint">members can subscribe to your calendar in their own app</span>
        </label>
      </div>

      {error && <p className="cal-sub-error">{error}</p>}
      {!link && !error && <p className="cal-sub-text cal-sub-mute">getting your link…</p>}

      {link && (
        <>
          <h3 className="cal-sub-h">subscribe</h3>
          <div className="cal-sub-row">
            <input
              className="cal-sub-url"
              type="text"
              readOnly
              value={link}
              aria-label="Your calendar link"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button type="button" className="cal-word cal-sub-copy" onClick={copy}>
              {copied ? 'copied' : 'copy'}
            </button>
          </div>

          <p className="cal-sub-text">
            add to:{' '}
            <a href={webcalLink(link)} onClick={() => track('calendar_subscribe_app', { app: 'webcal' })}>
              apple calendar / outlook
            </a>
            {' · '}
            <a
              href={googleCalendarLink(link)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('calendar_subscribe_app', { app: 'google' })}
            >
              google calendar
            </a>
            {' · '}or paste the link into any app that can subscribe to a calendar by URL.
          </p>

          {wasReset && <p className="cal-sub-text">new link made. the old one no longer works.</p>}

          <p className="cal-sub-text cal-sub-mute">
            {sharing?.calendarFeedPublic
              ? 'this link is on your profile, so members can follow your calendar. '
              : "anyone who has this link can see the events you've ticked. "}
            want to cut off everyone who has it?{' '}
            <button type="button" className="cal-inline" onClick={reset} disabled={resetting}>
              {resetting ? 'making a new link…' : 'make a new link'}
            </button>
            . calendar apps check for changes on their own schedule; google can take up to a day.
          </p>
        </>
      )}
    </section>
  );
};

export default CalendarMine;
