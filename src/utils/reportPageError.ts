/** Reported once per failure, so a page that keeps breaking shows up in the
 *  analytics rather than only in one member's console. */
export function reportPageError(error: unknown): void {
  console.error(error);
  window.umami?.track('page_error', {
    path: window.location.pathname,
    message: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
  });
}
