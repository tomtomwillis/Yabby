/* Inside the home shell the body column scrolls, not the window, so anything
   that drives or watches page scroll has to ask which it is. */

/* Below the shell's mobile breakpoint the column is `overflow: visible` and the
   window scrolls instead, so the element existing is not enough — scrolling the
   column there is a silent no-op. Asking for the computed overflow tracks the
   breakpoint without restating its width. */
function scrollRoot(): HTMLElement | null {
  const el = document.querySelector<HTMLElement>('.home-main');
  if (!el) return null;
  const { overflowY } = getComputedStyle(el);
  return overflowY === 'auto' || overflowY === 'scroll' ? el : null;
}

/** Scroll the page, whichever element that turns out to be. */
export function scrollPageTo(options: ScrollToOptions): void {
  const el = scrollRoot();
  if (el) el.scrollTo(options);
  else window.scrollTo(options);
}

/** Subscribe to page scroll. Returns the unsubscribe. */
export function onPageScroll(handler: () => void): () => void {
  // EventTarget rather than the HTMLElement | Window union — the union's
  // overloads are not callable together.
  const target: EventTarget = scrollRoot() ?? window;
  target.addEventListener('scroll', handler, { passive: true });
  return () => target.removeEventListener('scroll', handler);
}
