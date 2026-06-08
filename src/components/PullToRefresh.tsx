import { useEffect, useRef, useState } from 'react';
import { MdRefresh } from 'react-icons/md';
import './PullToRefresh.css';

const THRESHOLD = 120;
const MAX_PULL = 180;

export default function PullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [releasing, setReleasing] = useState(false);
  const startYRef = useRef(0);
  const activeRef = useRef(false);

  useEffect(() => {
    if (!('ontouchstart' in window)) return;

    function onTouchStart(e: TouchEvent) {
      if (document.body.style.position === 'fixed') return;
      if (window.scrollY > 2) return;
      startYRef.current = e.touches[0].clientY;
      activeRef.current = true;
    }

    function onTouchMove(e: TouchEvent) {
      if (!activeRef.current) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        activeRef.current = false;
        return;
      }
      e.preventDefault();
      setPullDistance(Math.min(delta, MAX_PULL));
      setReleasing(false);
    }

    function onTouchEnd() {
      if (!activeRef.current) return;
      activeRef.current = false;
      setReleasing(true);

      setPullDistance(prev => {
        if (prev >= THRESHOLD) {
          window.location.reload();
          return prev;
        }
        return 0;
      });
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
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
