import React, { useEffect, useState } from 'react';
import { getUserProfile, type UserProfile } from '../../utils/userCache';
import SiteLink from './SiteLink';

interface PosterStatsProps {
  userId?: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The forum identity block beside a poster's avatar: their bio, when they
    joined, and where they are. All of it comes out of
    the one profile document. Reads through the shared profile cache,
    so a thread with five posts by the same person costs one users read, and
    that read is shared with the hover bubble on their name. */
const PosterStats: React.FC<PosterStatsProps> = ({ userId }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    getUserProfile(userId).then((data) => live && setProfile(data));
    return () => {
      live = false;
    };
  }, [userId]);

  if (!profile) return null;

  const joined = profile.joinedAt
    ? `${MONTHS[profile.joinedAt.getMonth()]} ${profile.joinedAt.getFullYear()}`
    : null;
  const place = [profile.locationFlag, profile.locationText].filter(Boolean).join(' ');

  if (!joined && !place && !profile.bio && !profile.siteUrl) return null;

  const hasMeta = !!joined || !!place;

  return (
    <div className="user-message-poster-stats">
      {profile.bio && <span className="user-message-poster-bio">{profile.bio}</span>}
      {profile.siteUrl && <SiteLink url={profile.siteUrl} className="user-message-poster-site" />}
      {/* Everything the board counted on their behalf, kept apart from the one
          line above it that they wrote themselves. */}
      {hasMeta && (
        <div className="user-message-poster-meta">
          {joined && <span>joined {joined}</span>}
          {/* postCount still accrues on every post, but is not shown until the
              historical tally is backfilled — it undercounts pre-existing posts. */}
          {place && <span>{place}</span>}
        </div>
      )}
    </div>
  );
};

export default PosterStats;
