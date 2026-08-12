import React from 'react';
import { normalizeSiteUrl } from '../../utils/sanitise';

interface SiteLinkProps {
  url: string;
  className?: string;
  style?: React.CSSProperties;
}

/** A profile's site address, shown exactly as it was typed. Anything that is
    not plausibly a web address falls back to plain text rather than becoming a
    broken link. */
const SiteLink: React.FC<SiteLinkProps> = ({ url, className, style }) => {
  if (!url) return null;

  const href = normalizeSiteUrl(url);
  if (!href) return <span className={className} style={style}>{url}</span>;

  return (
    <a className={className} style={style} href={href} target="_blank" rel="noopener noreferrer">
      {url}
    </a>
  );
};

export default SiteLink;
