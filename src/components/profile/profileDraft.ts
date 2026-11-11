// The profile as saved and as being edited, and the checks a draft must pass
// before it is written. No Firestore, React or DOM here, so it runs under node;
// the .ts extension is for node, which does not resolve bare paths.
import { SOCIAL_ORDER, parseSocial, type SocialPlatform, type Socials } from '../../utils/socials.ts';

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 20;
// Matches isValidUsername in firestore.rules.
export const USERNAME_PATTERN = /^[a-zA-Z0-9]+([ ._-][a-zA-Z0-9]+)*$/;
// Matches the pronouns cap in firestore.rules.
export const PRONOUNS_MAX = 30;

export interface SocialRow {
  id: number;
  platform: SocialPlatform | '';
  value: string;
}

export interface ProfileFields {
  username: string;
  color: string;
  shape: string;
  avatar: string;
  bio: string;
  pronouns: string;
  siteUrl: string;
  locationFlag: string;
  locationText: string;
}

export interface SavedProfile extends ProfileFields {
  socials: Socials;
}

/** The edit form's copy. Socials are rows so a half-filled one can be held. */
export interface ProfileDraft extends ProfileFields {
  socials: SocialRow[];
}

export const EMPTY_PROFILE: SavedProfile = {
  username: '',
  color: 'blue',
  shape: 'star',
  avatar: '/Stickers/avatar_star_blue.webp',
  bio: '',
  pronouns: '',
  siteUrl: '',
  locationFlag: '',
  locationText: '',
  socials: {},
};

export const sameSocials = (a: Socials, b: Socials): boolean =>
  SOCIAL_ORDER.every((platform) => a[platform] === b[platform]);

/** Usernames are reserved case-insensitively, so "alice " and "al  ice" must
 *  not be able to stand in for "alice" on a post. */
export const normaliseUsername = (value: string) => value.trim().replace(/\s+/g, ' ');

/** A draft to edit, starting from what is saved. `nextId` numbers the rows. */
export function draftFrom(profile: SavedProfile, nextId: () => number): ProfileDraft {
  return {
    ...profile,
    socials: SOCIAL_ORDER.filter((platform) => profile.socials[platform]).map((platform) => ({
      id: nextId(),
      platform,
      value: profile.socials[platform]!,
    })),
  };
}

/** The username and socials a draft would save, or the first reason it cannot
 *  be saved. The username check matches isValidUsername in firestore.rules,
 *  minus the stray-space cases that normaliseUsername has already removed. */
export function validateProfileDraft(
  draft: Pick<ProfileDraft, 'username' | 'socials'>,
): { username: string; socials: Socials } | { error: string } {
  const username = normaliseUsername(draft.username);
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    return { error: `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.` };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      error: 'Username must start and end with a letter or number, and can use spaces, dots, hyphens and underscores between them.',
    };
  }

  // Rows left without a platform or a value are dropped rather than refused —
  // an "add" clicked and then thought better of.
  const socials: Socials = {};
  for (const row of draft.socials) {
    if (!row.platform || !row.value.trim()) continue;
    const parsed = parseSocial(row.platform, row.value);
    if ('error' in parsed) return { error: parsed.error };
    socials[row.platform] = parsed.handle;
  }
  return { username, socials };
}
