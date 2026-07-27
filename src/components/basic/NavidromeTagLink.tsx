import React from 'react';
import { useNavidromeCard, type CardTarget } from '../../utils/useNavidromeCard';

interface NavidromeTagLinkProps {
  target: CardTarget;
  href: string;
  children: React.ReactNode;
}

/** An @-tagged album or artist in a message. Hovering opens the details card,
 *  clicking pins it. Still a real anchor, so modified clicks and "copy link
 *  address" keep working. */
const NavidromeTagLink: React.FC<NavidromeTagLinkProps> = ({ target, href, children }) => {
  const { open, close } = useNavidromeCard();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Let cmd/ctrl/shift-click through to Navidrome in a new tab or window.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    window.umami?.track('navidrome_card_open', { type: target.type, id: target.id });
    open({ target, at: { x: e.clientX, y: e.clientY }, pinned: true, follow: false });
  };

  const openFromRect = (e: React.FocusEvent<HTMLAnchorElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // No cursor to follow when focus arrives by keyboard, so anchor to the link.
    open({ target, at: { x: rect.left, y: rect.bottom }, pinned: false, follow: false });
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="user-message-link navidrome-tag"
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

export default NavidromeTagLink;
