import React, { useState } from 'react';
import { SOCIAL_PLATFORMS, type SocialPlatform } from '../../utils/socials';
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
  const def = SOCIAL_PLATFORMS[platform];
  const shown = platform === 'twitter' || platform === 'instagram' ? `@${handle}` : handle;

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
