/* Only the handle is stored, never a URL someone pasted — the link is rebuilt
   from a fixed template, so every one of them lands on the site it claims to.
   The patterns are the same ones isValidSocials in firestore.rules and
   SOCIAL_PATTERNS in backend_server/data/policy.js enforce; change all three
   together. */

export type SocialPlatform =
  | 'instagram'
  | 'twitter'
  | 'signal'
  | 'discord'
  | 'playstation'
  | 'bandcampArtist'
  | 'bandcampFan'
  | 'soundcloud'
  | 'mixcloud';

export type Socials = Partial<Record<SocialPlatform, string>>;

interface PlatformDef {
  label: string;
  placeholder: string;
  pattern: RegExp;
  hint: string;
  lowercase?: true;
  /** Where the handle lives on the platform. Absent where no public page can be
      built from a username alone — those are shown as text to copy. */
  url?: (handle: string) => string;
  /** Pulls the handle out of a pasted profile link. */
  fromUrl?: (url: URL) => string | null;
}

const firstSegment = (hosts: string[]) => (url: URL): string | null => {
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile)\./, '');
  if (!hosts.includes(host)) return null;
  const segment = url.pathname.split('/').filter(Boolean)[0];
  return segment ? decodeURIComponent(segment).replace(/^@/, '') : null;
};

export const SOCIAL_PLATFORMS: Record<SocialPlatform, PlatformDef> = {
  instagram: {
    label: 'instagram',
    placeholder: 'username or instagram.com/…',
    pattern: /^[A-Za-z0-9._]{1,30}$/,
    hint: 'up to 30 letters, numbers, dots and underscores',
    url: (h) => `https://www.instagram.com/${h}/`,
    fromUrl: firstSegment(['instagram.com']),
  },
  twitter: {
    label: 'twitter / x',
    placeholder: '@handle or x.com/…',
    pattern: /^[A-Za-z0-9_]{1,15}$/,
    hint: 'up to 15 letters, numbers and underscores',
    url: (h) => `https://x.com/${h}`,
    fromUrl: firstSegment(['x.com', 'twitter.com']),
  },
  signal: {
    label: 'signal',
    placeholder: 'username.01',
    pattern: /^[A-Za-z0-9_]{3,32}[.][0-9]{2,10}$/,
    hint: 'your username with its number, like name.01 — Signal links cannot be read, so type it',
  },
  discord: {
    label: 'discord',
    placeholder: 'username',
    pattern: /^[a-z0-9_.]{2,32}$/,
    hint: '2–32 letters, numbers, dots and underscores',
    lowercase: true,
  },
  playstation: {
    label: 'playstation',
    placeholder: 'online ID',
    pattern: /^[A-Za-z][A-Za-z0-9_-]{2,15}$/,
    hint: '3–16 characters, starting with a letter',
  },
  bandcampArtist: {
    label: 'bandcamp (artist)',
    placeholder: 'name or name.bandcamp.com',
    pattern: /^[a-z0-9][a-z0-9-]{0,62}$/,
    hint: 'the part before .bandcamp.com',
    lowercase: true,
    url: (h) => `https://${h}.bandcamp.com/`,
    fromUrl: (url) => {
      const match = url.hostname.toLowerCase().match(/^([a-z0-9-]+)\.bandcamp\.com$/);
      return match && match[1] !== 'www' ? match[1] : null;
    },
  },
  bandcampFan: {
    label: 'bandcamp (fan)',
    placeholder: 'username or bandcamp.com/…',
    pattern: /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/,
    hint: 'the part after bandcamp.com/',
    url: (h) => `https://bandcamp.com/${h}`,
    fromUrl: firstSegment(['bandcamp.com']),
  },
  soundcloud: {
    label: 'soundcloud',
    placeholder: 'username or soundcloud.com/…',
    pattern: /^[A-Za-z0-9_-]{1,64}$/,
    hint: 'the part after soundcloud.com/ — short on.soundcloud.com links cannot be read',
    url: (h) => `https://soundcloud.com/${h}`,
    fromUrl: firstSegment(['soundcloud.com']),
  },
  mixcloud: {
    label: 'mixcloud',
    placeholder: 'username or mixcloud.com/…',
    pattern: /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/,
    hint: 'the part after mixcloud.com/',
    url: (h) => `https://www.mixcloud.com/${h}/`,
    fromUrl: firstSegment(['mixcloud.com']),
  },
};

/** Display and dropdown order. */
export const SOCIAL_ORDER = Object.keys(SOCIAL_PLATFORMS) as SocialPlatform[];

const LOOKS_LIKE_LINK = /^https?:\/\/|^[^\s/]+\.[a-z]{2,}(\/|$)/i;

/** A username or a pasted profile link, reduced to the handle the rules accept. */
export function parseSocial(
  platform: SocialPlatform,
  raw: string,
): { handle: string } | { error: string } {
  const def = SOCIAL_PLATFORMS[platform];
  let value = raw.trim();

  if (def.fromUrl && LOOKS_LIKE_LINK.test(value)) {
    try {
      const fromLink = def.fromUrl(new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`));
      if (fromLink) value = fromLink;
    } catch {
      // Not a URL after all; judged as a username below.
    }
  }

  value = value.replace(/^@/, '');
  if (def.lowercase) value = value.toLowerCase();

  return def.pattern.test(value) ? { handle: value } : { error: `${def.label}: ${def.hint}.` };
}

/** Whatever a users document holds, cut down to the entries the rules would
    have let through — a stale cache or a hand-edited document never reaches
    the page as a link. */
export function readSocials(data: unknown): Socials {
  if (!data || typeof data !== 'object') return {};
  const out: Socials = {};
  for (const platform of SOCIAL_ORDER) {
    const value = (data as Record<string, unknown>)[platform];
    if (typeof value === 'string' && SOCIAL_PLATFORMS[platform].pattern.test(value)) {
      out[platform] = value;
    }
  }
  return out;
}
