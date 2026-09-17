import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { auth } from '../firebaseConfig';
import { getUserProfile, type UserProfile as Profile } from '../utils/userCache';
import Header from '../components/basic/Header';
import SiteLink from '../components/basic/SiteLink';
import './UserProfile.css';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const normalizeAvatarPath = (avatarPath: string): string => {
  if (!avatarPath) return '';
  const cleanPath = avatarPath.startsWith('/') ? avatarPath.substring(1) : avatarPath;
  if (cleanPath.startsWith('Stickers/')) return `/${cleanPath}`;
  if (cleanPath.includes('/')) return `/Stickers/${cleanPath.split('/').pop()}`;
  return `/Stickers/${cleanPath}`;
};

const UserProfile: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [error, setError] = useState('');
  const [avatarBroken, setAvatarBroken] = useState(false);

  /* Through the shared profile cache rather than its own read: the board, the
     hover bubble on a username and this page all want the same document, and
     the first of them to ask pays for it. */
  useEffect(() => {
    if (!userId) {
      setError('No user specified.');
      setLoading(false);
      return;
    }

    let live = true;
    setAvatarBroken(false);

    getUserProfile(userId)
      .then((data) => {
        if (!live) return;
        /* The cache answers with its empty profile rather than throwing when
           there is no document, so an absent member reads as one with no name
           of their own. */
        if (!data.hasUsername) setError('User not found.');
        else setProfile(data);
      })
      .catch((err) => {
        console.error('Error fetching user profile:', err);
        if (live) setError('Failed to load profile.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    setIsOwnProfile(auth.currentUser?.uid === userId);
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) setIsOwnProfile(user.uid === userId);
    });

    return () => {
      live = false;
      unsubscribe();
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="user-page">
        <p className="up-status">loading…</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="user-page">
        <Header title="Profile" subtitle="Public Profile" />
        <p className="up-error">{error || 'Failed to load profile.'}</p>
      </div>
    );
  }

  const normalizedAvatar = normalizeAvatarPath(profile.avatar);
  const showAvatar = !!normalizedAvatar && !avatarBroken;
  const joined = profile.joinedAt
    ? `${MONTHS[profile.joinedAt.getMonth()]} ${profile.joinedAt.getFullYear()}`
    : null;
  /* When they joined is pinned to the bar rather than listed here — the bar is
     where a page's note goes, and saying it twice is saying it twice. */
  const hasFacts = !!profile.siteUrl || !!profile.locationFlag || !!profile.locationText;

  return (
    <div className="user-page">
      <Header title={profile.username} subtitle="Public Profile" />

      <div className="up-bar">
        <span className="up-bar-label">profile</span>
        <span className="up-bar-rule" aria-hidden="true"></span>
        <span className="up-bar-note">{joined ? `member since ${joined}` : 'member'}</span>
        {isOwnProfile && (
          <>
            <span className="up-bar-sep" aria-hidden="true">·</span>
            <Link to="/profile" className="up-bar-edit">edit</Link>
          </>
        )}
      </div>

      <div className="up-card">
        <div className="up-gutter">
          <div className={`up-avatar${showAvatar ? '' : ' up-avatar--none'}`}>
            {showAvatar ? (
              <img
                src={normalizedAvatar}
                alt={`${profile.username}'s sticker`}
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              profile.username.charAt(0).toUpperCase()
            )}
          </div>
        </div>

        <span className="up-channel" aria-hidden="true"></span>

        <div className="up-body">
          {profile.bio ? (
            <p className="up-bio">{profile.bio}</p>
          ) : (
            <p className="up-bio up-bio--none">no bio yet.</p>
          )}

          {hasFacts && (
            <dl className="up-facts">
              {profile.siteUrl && (
                <>
                  <dt className="up-fact-key">
                    site<span className="up-fact-leader" aria-hidden="true"></span>
                  </dt>
                  <dd className="up-fact-val"><SiteLink url={profile.siteUrl} /></dd>
                </>
              )}

              {(profile.locationFlag || profile.locationText) && (
                <>
                  <dt className="up-fact-key">
                    where<span className="up-fact-leader" aria-hidden="true"></span>
                  </dt>
                  <dd className="up-fact-val">
                    {profile.locationFlag && <span className="up-flag">{profile.locationFlag}</span>}
                    {profile.locationText}
                  </dd>
                </>
              )}

            </dl>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
