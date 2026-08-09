import React, { useEffect, useState } from 'react';
import { getUserProfile, type UserProfile } from '../../utils/userCache';

interface PosterStatsProps {
  userId?: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** The forum identity block under a poster's name: when they joined, how much
    they have said, and where they are. Reads through the shared profile cache,
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

  if (!joined && !profile.postCount && !place) return null;

  return (
    <div className="user-message-poster-stats">
      {joined && <span>joined {joined}</span>}
      {profile.postCount > 0 && (
        <span>
          {profile.postCount} {profile.postCount === 1 ? 'post' : 'posts'}
        </span>
      )}
      {place && <span>{place}</span>}
    </div>
  );
};

export default PosterStats;
