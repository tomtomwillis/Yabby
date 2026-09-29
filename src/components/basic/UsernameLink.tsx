import React, { useContext } from 'react';
import { Link } from 'react-router-dom';
import { useNavidromeCard, type CardTarget } from '../../utils/useNavidromeCard';
import { CardHostContext } from '../../utils/cardHost';

interface UsernameLinkProps {
  userId?: string;
  username: string;
  className?: string;
  /** Suppress the profile card where the same profile is already on screen —
      the message board draws bio, join date and location in the post's gutter,
      so the card would only repeat what is sitting next to it. */
  disableHover?: boolean;
}

const canHover = () => window.matchMedia('(hover: hover)').matches;

/** Username with a profile card, which behaves like an @-tag's: it follows the
    cursor on hover and a click pins it, with a link on to the profile. A
    modified click, a tap, or a name with the card switched off goes straight
    to the profile. */
const UsernameLink: React.FC<UsernameLinkProps> = ({ userId, username, className, disableHover }) => {
  const { open, close } = useNavidromeCard();
  // Inside a pinned card (an event's "added by"), the profile takes that card's
  // place and offers a way back to it.
  const host = useContext(CardHostContext);

  if (!userId) return <span className={className}>{username}</span>;
  if (disableHover) return <Link to={`/user/${userId}`} className={className}>{username}</Link>;

  const target: CardTarget = { type: 'user', id: userId };

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Touch has no hover to preview with, so a tap is for the profile itself.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !canHover()) return;
    e.preventDefault();
    const origin = host?.origin();
    if (host && origin) {
      open({ target, at: origin, exact: true, back: host.back, pinned: true, follow: false });
      return;
    }
    open({ target, at: { x: e.clientX, y: e.clientY }, pinned: true, follow: false });
  };

  return (
    <Link
      to={`/user/${userId}`}
      className={className}
      onMouseEnter={(e) => {
        // Touch fires a synthetic mouseenter on tap; the card would flash over
        // the profile the tap is already navigating to.
        if (canHover()) open({ target, at: { x: e.clientX, y: e.clientY }, pinned: false, follow: true });
      }}
      onMouseLeave={() => close(target)}
      onFocus={(e) => {
        if (!canHover()) return;
        const rect = e.currentTarget.getBoundingClientRect();
        open({ target, at: { x: rect.left, y: rect.bottom }, pinned: false, follow: false });
      }}
      onBlur={() => close(target)}
      onClick={handleClick}
    >
      {username}
    </Link>
  );
};

export default UsernameLink;
