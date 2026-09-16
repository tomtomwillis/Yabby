import { useEffect, useRef, useState } from 'react';
import { MdRefresh } from 'react-icons/md';
import './PullToRefresh.css';

const THRESHOLD = 120;
const MAX_PULL = 180;
// How far the finger travels before we decide the gesture is ours. Below this
// the touch still belongs to the page, so a map pan or a swipe never gets
// captured by a few stray pixels of downward drift.
const SLOP = 12;

/* Gestures that start inside these never belong to pull-to-refresh: maps pan,
   text fields scroll, and anything opting out says so explicitly. */
const OPT_OUT_SELECTOR =
  '.leaflet-container, input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-no-pull-refresh]';

/** True if the touch began somewhere that owns its own vertical drag. */
function startedInsideOwnScroller(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;

  while (el && el !== document.body) {
    if (el.matches(OPT_OUT_SELECTOR)) return true;

    const overflowY = getComputedStyle(el).overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
      return true;
    }

    el = el.parentElement;
  }

  return false;
}

export default function PullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [releasing, setReleasing] = useState(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const activeRef = useRef(false);
  const capturedRef = useRef(false);
  const distanceRef = useRef(0);

  useEffect(() => {
    if (!('ontouchstart' in window)) return;

    function reset() {
      activeRef.current = false;
      capturedRef.current = false;
      distanceRef.current = 0;
    }

    function onTouchStart(e: TouchEvent) {
      reset();
      if (e.touches.length !== 1) return;
      if (document.body.style.position === 'fixed') return;
      if (window.scrollY > 2) return;
      if (startedInsideOwnScroller(e.target)) return;

      startYRef.current = e.touches[0].clientY;
      startXRef.current = e.touches[0].clientX;
      activeRef.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!activeRef.current) return;

      // A second finger means pinch-zoom, not a pull.
      if (e.touches.length !== 1) {
        reset();
        setPullDistance(0);
        return;
      }

      const dy = e.touches[0].clientY - startYRef.current;
      const dx = e.touches[0].clientX - startXRef.current;

      if (!capturedRef.current) {
        // Wait until the gesture's direction is unambiguous.
        if (Math.abs(dy) < SLOP && Math.abs(dx) < SLOP) return;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
          activeRef.current = false;
          return;
        }
        capturedRef.current = true;
        // Rebase so the indicator starts from zero rather than jumping by SLOP.
        startYRef.current = e.touches[0].clientY;
        return;
      }

      if (dy <= 0) {
        distanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      e.preventDefault();
      distanceRef.current = Math.min(dy, MAX_PULL);
      setPullDistance(distanceRef.current);
      setReleasing(false);
    }

    function onTouchEnd() {
      if (!activeRef.current) return;
      const distance = distanceRef.current;
      const captured = capturedRef.current;
      reset();

      if (!captured) return;

      setReleasing(true);
      if (distance >= THRESHOLD) {
        window.location.reload();
        return;
      }
      setPullDistance(0);
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  // Translate from fully hidden (-100%) to fully visible (0%)
  const translateY = `${-100 + progress * 100}%`;
  const isTriggered = pullDistance >= THRESHOLD;

  return (
    <div
      className={`pull-to-refresh-indicator${releasing ? ' ptr-releasing' : ''}${isTriggered ? ' ptr-triggered' : ''}`}
      style={{ transform: `translateY(${translateY})` }}
      aria-hidden="true"
    >
      <div className={`ptr-spinner${isTriggered ? ' ptr-spin' : ''}`}>
        <MdRefresh size={26} color="var(--colour2)" />
      </div>
    </div>
  );
}
