import { useEffect, useState } from 'react';
import { getUserProfile, type UserProfile } from './userCache';

/** The name and avatar to show for a post or reply. Posts keep a copy of both
    from the day they were written, which goes stale when the member renames or
    changes avatar; the shared profile cache has the current ones. The stored
    copy stands in until the profile arrives, and wherever there is no profile
    to read: bots, which post under a name of their own, and members whose
    profile carries no name. */
export function usePosterIdentity(
  userId: string | undefined,
  isBot: boolean | undefined,
  stored: { username: string; avatar?: string },
): { username: string; avatar?: string } {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const lookup = isBot ? undefined : userId;

  useEffect(() => {
    if (!lookup) return;
    let live = true;
    getUserProfile(lookup).then((data) => live && setProfile(data));
    return () => {
      live = false;
    };
  }, [lookup]);

  if (!lookup || !profile) return stored;
  return {
    username: profile.hasUsername ? profile.username : stored.username,
    avatar: profile.avatar || stored.avatar,
  };
}
