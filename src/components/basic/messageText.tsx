import React from 'react';
import parse, { type HTMLReactParserOptions, Element, domToReact, type DOMNode } from 'html-react-parser';
import { sanitizeHtml, parseMarkdownLinks, linkifyText, validateUrl } from '../../utils/sanitise';
import { parseNavidromeLink } from '../../utils/navidrome';
import { parseEventLink } from '../events/eventTypes';
import NavidromeTagLink from './NavidromeTagLink';
import EventTagLink from '../events/EventTagLink';
import UsernameLink from './UsernameLink';

// A profile link, as the composer's @ member tag writes it. Matched on the
// live host only, so a look-alike domain is never drawn as an in-app link.
const profileIdFromHref = (href: string): string | null => {
  try {
    const url = new URL(href);
    if (url.hostname !== 'yabbyville.xyz' || url.search || url.hash) return null;
    return url.pathname.match(/^\/user\/([A-Za-z0-9_-]{1,128})\/?$/)?.[1] ?? null;
  } catch {
    return null;
  }
};

const textOf = (nodes: DOMNode[]): string =>
  nodes.map((n) => ('data' in n ? String(n.data) : n instanceof Element ? textOf(n.children as DOMNode[]) : '')).join('');

// Utility function to format message text for display.
// Handles both legacy HTML messages (with <a>, <br> tags) and new plain text messages.
export const parseMessageHTML = (htmlString: string): React.ReactNode => {
  // 1. Sanitize HTML (preserves safe tags like <a>, <br> from legacy messages)
  let processed = sanitizeHtml(htmlString);

  // 2. Convert \n to <br> (for new plain text messages; legacy HTML messages don't have \n)
  processed = processed.replace(/\n/g, '<br>');

  // 3. Parse markdown-style [text](url) links (from @/# tagging in new messages)
  processed = parseMarkdownLinks(processed);

  // 4. Auto-detect bare URLs and wrap in <a> tags (skips URLs already in <a> tags)
  processed = linkifyText(processed);

  // HTML parser options — enforce safe link rendering
  const options: HTMLReactParserOptions = {
    replace: (domNode) => {
      if (domNode instanceof Element) {
        const { name, attribs, children } = domNode;

        if (name === 'a') {
          const href = attribs?.href;
          if (!href || !validateUrl(href)) {
            return <span>{domToReact(children as DOMNode[], options)}</span>;
          }
          // @-tagged members open their profile in-app, with the profile card on hover.
          const profileId = profileIdFromHref(href);
          if (profileId) {
            return (
              <UsernameLink
                userId={profileId}
                username={textOf(children as DOMNode[])}
                className="user-message-link user-mention"
              />
            );
          }
          // @-tagged albums and artists get a hover card instead of a bare link.
          const navidromeTarget = parseNavidromeLink(href);
          if (navidromeTarget) {
            return (
              <NavidromeTagLink target={navidromeTarget} href={href}>
                {domToReact(children as DOMNode[], options)}
              </NavidromeTagLink>
            );
          }
          // Calendar events — the Event Bot's round-up — get one too.
          const eventId = parseEventLink(href);
          if (eventId) {
            return (
              <EventTagLink eventId={eventId} href={href}>
                {domToReact(children as DOMNode[], options)}
              </EventTagLink>
            );
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="user-message-link"
            >
              {domToReact(children as DOMNode[], options)}
            </a>
          );
        }

        // Allow <br> tags through
        if (name === 'br') {
          return <br />;
        }

        // For any other HTML tags, render as plain text
        return <span>{domToReact(children as DOMNode[], options)}</span>;
      }
      return undefined;
    }
  };

  try {
    return parse(processed, options);
  } catch (error) {
    console.warn('Failed to parse message content, falling back to plain text:', error);
    return htmlString;
  }
};
