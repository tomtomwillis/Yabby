import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getAllUserProfiles, type DirectoryEntry } from '../utils/userCache';
import { normalizeAvatarPath } from '../utils/avatarPath';
import Header from '../components/basic/Header';
import SiteLink from '../components/basic/SiteLink';
import SocialHandle from '../components/basic/SocialHandle';
import { SOCIAL_PLATFORMS, SOCIAL_ORDER } from '../utils/socials';
import './DirectoryPage.css';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const ALPHABET = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/* Test and system accounts, kept out of the repo rather than listed here.
   Cosmetic only — their profiles are still readable by any member. */
const HIDDEN_UIDS = new Set(
  (import.meta.env.VITE_DIRECTORY_HIDDEN_UIDS ?? '').split(',').map((uid: string) => uid.trim()).filter(Boolean),
);

/** The letter a member is filed under — accents folded away so é sits with e,
    and anything that is not a letter after that goes under #. */
const letterFor = (username: string): string => {
  const first = username.normalize('NFD').charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
};

const anchorFor = (letter: string): string => `dir-letter-${letter === '#' ? 'other' : letter}`;

const MemberAvatar: React.FC<{ member: DirectoryEntry }> = ({ member }) => {
  const [broken, setBroken] = useState(false);
  const src = normalizeAvatarPath(member.avatar);

  if (!src || broken) {
    return <span className="dir-avatar dir-avatar--none">{member.username.charAt(0).toUpperCase()}</span>;
  }
  return (
    <span className="dir-avatar">
      <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
    </span>
  );
};

const DirectoryPage: React.FC = () => {
  const [members, setMembers] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* The first member under each letter carries its anchor, so the index only
     needs to know which letters have anyone at all. */
  const firstOfLetter = useMemo(() => {
    const firsts = new Map<string, string>();
    for (const member of members) {
      const letter = letterFor(member.username);
      if (!firsts.has(letter)) firsts.set(letter, member.userId);
    }
    return firsts;
  }, [members]);

  const jumpTo = (letter: string) => {
    document.getElementById(anchorFor(letter))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    let live = true;
    getAllUserProfiles()
      .then((list) => {
        if (live) setMembers(list.filter((member) => !HIDDEN_UIDS.has(member.userId)));
      })
      .catch((err) => {
        console.error('Error fetching directory:', err);
        if (live) setError('Failed to load the directory.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="directory-page">
      <Header title="Directory" subtitle="Everyone in Yabbyville" />

      <div className="dir-bar">
        <span className="dir-bar-label">members</span>
        <span className="dir-bar-rule" aria-hidden="true"></span>
        <span className="dir-bar-note">{loading ? '…' : members.length}</span>
      </div>

      {!loading && !error && (
        <nav className="dir-alphabet" aria-label="Jump to letter">
          {ALPHABET.map((letter) => (
            <button
              key={letter}
              type="button"
              className="dir-letter"
              disabled={!firstOfLetter.has(letter)}
              onClick={() => jumpTo(letter)}
            >
              {letter}
            </button>
          ))}
        </nav>
      )}

      {loading && <p className="dir-status">loading…</p>}
      {error && <p className="dir-status dir-status--error">{error}</p>}

      {!loading && !error && (
        <ul className="dir-list">
          {members.map((member) => {
            const joined = member.joinedAt
              ? `${MONTHS[member.joinedAt.getMonth()]} ${member.joinedAt.getFullYear()}`
              : null;
            const hasWhere = !!member.locationFlag || !!member.locationText;
            const socialPlatforms = SOCIAL_ORDER.filter((platform) => member.socials[platform]);
            const letter = letterFor(member.username);
            const anchor = firstOfLetter.get(letter) === member.userId ? anchorFor(letter) : undefined;

            return (
              <li key={member.userId} id={anchor} className="dir-row">
                <Link to={`/user/${member.userId}`} className="dir-avatar-link" tabIndex={-1} aria-hidden="true">
                  <MemberAvatar member={member} />
                </Link>

                <div className="dir-body">
                  <div className="dir-head">
                    <Link to={`/user/${member.userId}`} className="dir-name">{member.username}</Link>
                    {joined && <span className="dir-joined">since {joined}</span>}
                  </div>

                  {member.bio ? (
                    <p className="dir-bio">{member.bio}</p>
                  ) : (
                    <p className="dir-bio dir-bio--none">no bio yet.</p>
                  )}

                  {(hasWhere || member.postCount > 0 || member.stickerCount > 0) && (
                    <div className="dir-facts">
                      {hasWhere && (
                        <span className="dir-fact">
                          {member.locationFlag && <span className="dir-flag">{member.locationFlag}</span>}
                          {member.locationText}
                        </span>
                      )}
                      {(member.postCount > 0 || member.stickerCount > 0) && (
                        <span className="dir-fact dir-counts">
                          {member.postCount > 0 && (
                            <span className="dir-count">
                              {member.postCount} {member.postCount === 1 ? 'post' : 'posts'}
                            </span>
                          )}
                          {member.stickerCount > 0 && (
                            <span className="dir-count">
                              <Link to={`/stickers?user=${member.userId}`}>
                                {member.stickerCount} {member.stickerCount === 1 ? 'sticker' : 'stickers'}
                              </Link>
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )}

                  {(member.siteUrl || socialPlatforms.length > 0) && (
                    <dl className="dir-socials">
                      {member.siteUrl && (
                        <>
                          <dt className="dir-social-label">site</dt>
                          <dd className="dir-social-handle"><SiteLink url={member.siteUrl} /></dd>
                        </>
                      )}
                      {socialPlatforms.map((platform) => (
                        <React.Fragment key={platform}>
                          <dt className="dir-social-label">{SOCIAL_PLATFORMS[platform].label}</dt>
                          <dd className="dir-social-handle">
                            <SocialHandle platform={platform} handle={member.socials[platform]!} />
                          </dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default DirectoryPage;
