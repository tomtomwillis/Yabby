import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useNavidromeCard, type CardTarget } from '../../utils/useNavidromeCard';
import { eventPath, todayISO } from './eventTypes';
import './YabbyBanner.css';

/** The symposium's calendar event. Empty until it has been added. */
const SYMPOSIUM_EVENT_ID = '';
const SYMPOSIUM_DATE = '2027-01-30';
const PARTS = ['Yabbyville Annual Symposium', '30th Jan 2027', 'Glasgow, Scotland'];

// Enough copies that one half of the track is wider than any screen, so the
// loop never shows a gap.
const REPEATS = 6;

/**
 * A ticker across the top of the home page for the 2027 symposium. Hovering
 * previews the event in the event card; clicking opens it on the calendar.
 * Gone once the day has passed.
 */
const YabbyBanner: React.FC = () => {
  const today = useMemo(todayISO, []);
  const { open, close } = useNavidromeCard();
  const target = useMemo<CardTarget>(() => ({ type: 'event', id: SYMPOSIUM_EVENT_ID }), []);

  if (!SYMPOSIUM_EVENT_ID || today > SYMPOSIUM_DATE) return null;

  const phrase = (
    <span className="yb-phrase">
      {PARTS.map((part) => (
        <React.Fragment key={part}>
          <span className="yb-star" aria-hidden="true">✦</span>
          <span>{part}</span>
        </React.Fragment>
      ))}
    </span>
  );

  return (
    <Link
      className="yb-banner"
      to={eventPath(SYMPOSIUM_EVENT_ID)}
      aria-label={PARTS.join(', ')}
      onMouseEnter={(e) => open({ target, at: { x: e.clientX, y: e.clientY }, pinned: false, follow: true })}
      onMouseLeave={() => close(target)}
      onClick={() => {
        close(target);
        window.umami?.track('home_yabby_banner', { id: SYMPOSIUM_EVENT_ID });
      }}
    >
      <span className="yb-track" aria-hidden="true">
        {[0, 1].map((half) => (
          <span key={half} className="yb-half">
            {Array.from({ length: REPEATS }, (_, i) => (
              <React.Fragment key={i}>{phrase}</React.Fragment>
            ))}
          </span>
        ))}
      </span>
    </Link>
  );
};

export default YabbyBanner;
