import React from 'react';
import SiteLink from '../basic/SiteLink';
import SocialHandle from '../basic/SocialHandle';
import { SOCIAL_PLATFORMS, SOCIAL_ORDER } from '../../utils/socials';
import type { SavedProfile } from './profileDraft';

interface ProfileViewProps {
  profile: SavedProfile;
  avatarBroken: boolean;
  onAvatarError: () => void;
  saveMessage: string;
  saveSuccess: boolean;
}

/** The read-only card: the profile as everyone else sees it. */
const ProfileView: React.FC<ProfileViewProps> = ({ profile, avatarBroken, onAvatarError, saveMessage, saveSuccess }) => {
  const { username, avatar, pronouns, bio, siteUrl, locationFlag, locationText, socials } = profile;
  const hasLocation = locationFlag || locationText;
  const hasSocials = SOCIAL_ORDER.some((platform) => socials[platform]);

  return (
    <>
      <div className="me-card">
        <div className={`me-avatar${avatar && !avatarBroken ? '' : ' me-avatar--none'}`}>
          {avatar && !avatarBroken ? (
            <img
              src={avatar}
              alt={`${username || 'your'} sticker`}
              onError={onAvatarError}
            />
          ) : (
            (username || 'A').charAt(0).toUpperCase()
          )}
        </div>

        <span className="me-channel" aria-hidden="true"></span>

        <div className="me-body">
          <p className="me-name">
            {username || 'Anonymous'}
            {pronouns && <span className="me-pronouns">{pronouns}</span>}
          </p>

          {bio ? (
            <p className="me-bio">{bio}</p>
          ) : (
            <p className="me-bio me-bio--none">no bio yet.</p>
          )}

          {(siteUrl || hasLocation || hasSocials) && (
            <dl className="me-facts">
              {siteUrl && (
                <>
                  <dt className="me-fact-key">
                    site<span className="me-fact-leader" aria-hidden="true"></span>
                  </dt>
                  <dd className="me-fact-val"><SiteLink url={siteUrl} /></dd>
                </>
              )}

              {hasLocation && (
                <>
                  <dt className="me-fact-key">
                    where<span className="me-fact-leader" aria-hidden="true"></span>
                  </dt>
                  <dd className="me-fact-val">
                    {locationFlag && <span className="me-flag-inline">{locationFlag}</span>}
                    {locationText}
                  </dd>
                </>
              )}

              {SOCIAL_ORDER.filter((platform) => socials[platform]).map((platform) => (
                <React.Fragment key={platform}>
                  <dt className="me-fact-key">
                    {SOCIAL_PLATFORMS[platform].label}
                    <span className="me-fact-leader" aria-hidden="true"></span>
                  </dt>
                  <dd className="me-fact-val">
                    <SocialHandle platform={platform} handle={socials[platform]!} />
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          )}
        </div>
      </div>

      {saveMessage && (
        <p
          className={`me-msg ${saveSuccess ? 'me-msg--good' : 'me-msg--bad'}`}
          role="status"
        >
          {saveMessage}
        </p>
      )}
    </>
  );
};

export default ProfileView;
