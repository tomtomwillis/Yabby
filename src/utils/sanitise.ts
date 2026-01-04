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