import React, { useMemo } from 'react';
import { useNavidromeCard, type CardTarget } from '../../utils/useNavidromeCard';

interface EventTagLinkProps {
  eventId: string;
  href: string;
  children: React.ReactNode;
}

/** A calendar event linked in a message — the Event Bot's round-up is made of
 *  these. Hovering opens the event card, clicking pins it, exactly as an
 *  @-tagged album does. A modified click still follows the link. */
const EventTagLink: React.FC<EventTagLinkProps> = ({ eventId, href, children }) => {
  const { open, close } = useNavidromeCard();
  const target = useMemo<CardTarget>(() => ({ type: 'event', id: eventId }), [eventId]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    window.umami?.track('event_card_open', { id: eventId });
    open({ target, at: { x: e.clientX, y: e.clientY }, pinned: true, follow: false });
  };

  const openFromRect = (e: React.FocusEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    open({ target, at: { x: rect.left, y: rect.bottom }, pinned: false, follow: false });
  };

  return (
    <a
      href={href}
      className="user-message-link navidrome-tag event-tag"
      onMouseEnter={(e) => open({ target, at: { x: e.clientX, y: e.clientY }, pinned: false, follow: true })}
      onMouseLeave={() => close(target)}
      onFocus={openFromRect}
      onBlur={() => close(target)}
      onClick={handleClick}
    >
      {children}
    </a>
  );
};

export default EventTagLink;
