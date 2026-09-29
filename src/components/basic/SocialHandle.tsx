import React, { useEffect, useState } from 'react';
import { SOCIAL_PLATFORMS, type SocialPlatform } from '../../utils/socials';
import { isSteamId64, steamPersonaName } from '../../utils/steamName';
import './SocialHandle.css';

interface SocialHandleProps {
  platform: SocialPlatform;
  handle: string;
}

/** One social account: a link where the platform has a public page for a
    username, otherwise the name with a copy button — Signal, Discord and
    PlayStation only find people by name. */
const SocialHandle: React.FC<SocialHandleProps> = ({ platform, handle }) => {
  const [copied, setCopied] = useState(false);
  const [steamName, setSteamName] = useState<string | null>(null);
  const def = SOCIAL_PLATFORMS[platform];

  useEffect(() => {
    if (platform !== 'steam' || !isSteamId64(handle)) return;
    let cancelled = false;
    steamPersonaName(handle).then((name) => {
      if (!cancelled) setSteamName(name);
    });
    return () => {
      cancelled = true;
    };
  }, [platform, handle]);

  // The radio handle is the full link itself, which is too long to show
  // in-line — the domain it points to is what a visitor actually wants to see.
  const shown =
    platform === 'twitter' || platform === 'instagram'
      ? `@${handle}`
      : platform === 'radio'
        ? handle.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')
        : platform === 'steam' && steamName
          ? steamName
          : handle;

  if (def.url) {
    return (
      <a className="social-handle" href={def.url(handle)} target="_blank" rel="noopener noreferrer">
        {shown}
      </a>
    );
  }

  const copy = () => {
    navigator.clipboard
      ?.writeText(handle)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  return (
    <span className="social-handle social-handle--text">
      {shown}
      <button
        type="button"
        className="social-handle-copy"
        onClick={copy}
        aria-label={`Copy ${def.label} username`}
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </span>
  );
};

export default SocialHandle;
