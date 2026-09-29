import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUserProfile, type UserProfile } from '../../utils/userCache';
import { normalizeAvatarPath } from '../../utils/avatarPath';
import SiteLink from './SiteLink';
import './UserCardBody.css';

interface UserCardBodyProps {
  userId: string;
  /** Called once the profile, or why there is none, has rendered — the frame
   *  fits itself to it and then appears, as it does for an event. */
  onContent?: (content: HTMLElement) => void;
  /** Closes the card on the way to the profile, which it would only cover. */
  onClose?: () => void;
}

/** A member's avatar, name, location and bio in the album/artist card frame. */
const UserCardBody: React.FC<UserCardBodyProps> = ({ userId, onContent, onClose }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    getUserProfile(userId)
      .then((loaded) => { if (!cancelled) setProfile(loaded); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [userId]);

  const settled = error || profile !== null;
  useLayoutEffect(() => {
    if (settled && rootRef.current) onContent?.(rootRef.current);
  }, [settled, onContent]);

  if (error) return <p className="sp-status" ref={rootRef}>could not load profile</p>;
  if (!profile) return <p className="sp-status">loading profile…</p>;

  return (
    <div className="ul-body" ref={rootRef}>
      <div className="ul-head">
        {profile.avatar && (
          <img className="ul-avatar" src={normalizeAvatarPath(profile.avatar)} alt="" draggable={false} />
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

      <p className={`ul-bio${profile.bio ? '' : ' is-empty'}`}>{profile.bio || 'no bio yet'}</p>
      {profile.siteUrl && <SiteLink url={profile.siteUrl} className="ul-site" />}
      <Link className="ul-open" to={`/user/${userId}`} onClick={onClose}>view profile →</Link>
    </div>
  );
};

export default UserCardBody;
