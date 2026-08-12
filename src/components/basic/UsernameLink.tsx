import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { getUserProfile, type UserProfile } from '../../utils/userCache';
import { normalizeAvatarPath } from '../../utils/avatarPath';
import SiteLink from './SiteLink';
import './UsernameLink.css';

interface UsernameLinkProps {
  userId?: string;
  username: string;
  className?: string;
  /** Suppress the hover bubble where the same profile is already on screen —
      the message board draws bio, join date and location in the post's gutter,
      so the card would only repeat what is sitting next to it. */
  disableHover?: boolean;
}

const OPEN_DELAY = 220;
const CARD_W = 292;
const GAP = 8;

/** Username with a profile bubble on hover. The bubble is pointer-events: none
    and portalled to the body, so it can neither swallow the click on the link
    underneath it nor be clipped by a scrolling ancestor. */
const UsernameLink: React.FC<UsernameLinkProps> = ({ userId, username, className, disableHover }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    setPos(null);
  }, []);

  useEffect(() => () => close(), [close]);

  // Anything that moves the anchor out from under the bubble dismisses it —
  // it is positioned once, on open, rather than tracking the element.
  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [pos, close]);

  const open = () => {
    if (!userId || disableHover) return;
    // Touch and coarse pointers fire a synthetic mouseenter on tap; without this
    // the bubble would flash over the profile the tap is already navigating to.
    if (!window.matchMedia('(hover: hover)').matches) return;

    openTimer.current = setTimeout(async () => {
      const data = await getUserProfile(userId);
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Below by default, flipped above when the viewport bottom is closer than
      // the card is tall; clamped so a name near either edge stays on screen.
      const estH = 162 + (data.bio ? 50 : 0) + (data.siteUrl ? 18 : 0);
      const below = rect.bottom + GAP;
      const top = below + estH > window.innerHeight && rect.top > estH + GAP ? rect.top - estH - GAP : below;
      const left = Math.max(GAP, Math.min(rect.left, window.innerWidth - CARD_W - GAP));

      setProfile(data);
      setPos({ top, left });
    }, OPEN_DELAY);
  };

  const label = userId ? (
    <Link
      ref={anchorRef}
      to={`/user/${userId}`}
      className={className}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      {username}
    </Link>
  ) : (
    <span className={className}>{username}</span>
  );

  return (
    <>
      {label}
      {pos && profile &&
        createPortal(
          <div className="ul-card" style={{ top: pos.top, left: pos.left, width: CARD_W }} role="tooltip">
            <span className="ul-edge ul-edge-top" aria-hidden="true">{'─'.repeat(80)}</span>
            <span className="ul-corner ul-corner-tl" aria-hidden="true">┌</span>
            <span className="ul-corner ul-corner-tr" aria-hidden="true">┐</span>

            <div className="ul-head">
              {profile.avatar && (
                <img className="ul-avatar" src={normalizeAvatarPath(profile.avatar)} alt="" loading="lazy" />
              )}
              <div className="ul-ident">
                <span className="ul-name">{profile.username}</span>
                {(profile.locationFlag || profile.locationText) && (
                  <span className="ul-loc">
                    {profile.locationFlag} {profile.locationText}
                  </span>
                )}
              </div>
            </div>

            <p className={`ul-bio${profile.bio ? '' : ' is-empty'}`}>
              {profile.bio || 'no bio yet'}
            </p>
            {profile.siteUrl && <SiteLink url={profile.siteUrl} className="ul-site" />}
            <span className="ul-hint">click to view profile →</span>

            <span className="ul-edge ul-edge-bottom" aria-hidden="true">{'─'.repeat(80)}</span>
            <span className="ul-corner ul-corner-bl" aria-hidden="true">└</span>
            <span className="ul-corner ul-corner-br" aria-hidden="true">┘</span>
          </div>,
          document.body,
        )}
    </>
  );
};

export default UsernameLink;
