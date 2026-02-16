import DOMPurify from 'dompurify';

/**
 * Sanitizes HTML content from user input
 * Allows only safe formatting tags (links, bold, italic, line breaks)
 * Strips all dangerous content (scripts, iframes, event handlers, etc.)
 * 
 * @param dirty - Untrusted user input that may contain HTML
 * @returns Sanitized HTML safe for display
 */
export const sanitizeHtml = (dirty: string): string => {
  return DOMPurify.sanitize(dirty, {
    // Only allow these HTML tags
    ALLOWED_TAGS: ['a', 'b', 'i', 'em', 'strong', 'br', 'p'],
    
    // Only allow these attributes on allowed tags
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    
    // Block data- attributes (could be exploited by JS frameworks)
    ALLOW_DATA_ATTR: false,
    
    // Additional security options
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
};

/**
 * Strips ALL HTML tags, leaving only plain text
 * Use this for content that should never have formatting (usernames, etc.)
 * 
 * @param text - Text that may contain HTML
 * @returns Plain text with all HTML removed
 */
export const sanitizeText = (text: string): string => {
  return text.replace(/<[^>]*>/g, '');
};

/**
 * Validates that a URL is safe (http/https only)
 * Blocks dangerous protocols like javascript:, data:, file:
 * 
 * @param url - URL to validate
 * @returns true if URL is safe, false otherwise
 */
export const validateUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Sanitizes a URL to ensure it's safe
 * Returns empty string if URL is invalid or dangerous
 *
 * @param url - URL to sanitize
 * @returns Sanitized URL or empty string
 */
export const sanitizeUrl = (url: string): string => {
  if (!validateUrl(url)) {
    return '';
  }
  // Additional URL sanitization
  return DOMPurify.sanitize(url, { ALLOWED_TAGS: [] });
};

/**
 * Converts markdown-style links [text](url) to <a> tags.
 * Only converts links with valid http/https URLs.
 */
export const parseMarkdownLinks = (text: string): string => {
  return text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_match, linkText, url) => {
    if (validateUrl(url)) {
      const safeUrl = DOMPurify.sanitize(url, { ALLOWED_TAGS: [] });
      const safeText = DOMPurify.sanitize(linkText, { ALLOWED_TAGS: [] });
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeText}</a>`;
    }
    return linkText;
  });
};

/**
 * Auto-detects bare URLs in text and wraps them in <a> tags.
 * Skips URLs that are already inside <a> tags (from legacy HTML or markdown link parsing).
 */
export const linkifyText = (html: string): string => {
  // Split on existing <a> tags to avoid double-wrapping
  const parts = html.split(/(<a\s[^>]*>.*?<\/a>)/gi);
  return parts.map(part => {
    // If this part is an existing <a> tag, leave it alone
    if (/^<a\s/i.test(part)) return part;
    // Replace bare URLs in non-link text
    return part.replace(
      /(https?:\/\/[^\s<>"']+)/g,
      (url) => {
        if (validateUrl(url)) {
          return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
        }
        return url;
      }
    );
  }).join('');
};