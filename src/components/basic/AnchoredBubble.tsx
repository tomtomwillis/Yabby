import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './AnchoredBubble.css';

interface AnchoredBubbleProps {
  /** The element the bubble hangs off. */
  anchor: HTMLElement | null;
  /** Positioned ancestor the bubble is absolutely placed inside. */
  container: HTMLElement | null;
  /** Which side of the anchor the bubble opens on. */
  placement?: 'below' | 'above';
  onClose: () => void;
  children: React.ReactNode;
}

/** Gap between the anchor's edge and the bubble. */
const OFFSET = 10;
/** Kept clear of the viewport edge the bubble grows towards. */
const EDGE = 16;
/** Below this the bubble is too short to be worth opening scrolled. */
const MIN_BODY = 120;

/** A floating box under whatever was clicked, skinned like the travel map's
 *  pin bubble. Nothing behind it is dimmed or blocked — clicking elsewhere is
 *  what closes it. */
interface Position {
  left: number;
  tip: number;
  /** Distance from the container's top or bottom, per placement. */
  offset: number;
  /** Room the body may use before it has to scroll. */
  maxBody: number;
}

const AnchoredBubble: React.FC<AnchoredBubbleProps> = ({
  anchor, container, placement = 'below', onClose, children,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);

  // Layout effect, not effect: the box is measured to clamp it inside the
  // container, so it must not paint at the wrong place first.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!anchor || !container || !box) return;

    const place = () => {
      const a = anchor.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      const width = box.offsetWidth;
      const anchorCentre = a.left + a.width / 2 - c.left;
      const left = Math.max(0, Math.min(anchorCentre - width / 2, c.width - width));
      // Opening upward measures against the viewport, not the container: the
      // container is usually far shorter than the space the bubble can use.
      const room = placement === 'above'
        ? a.top - EDGE - OFFSET
        : window.innerHeight - a.bottom - EDGE - OFFSET;
      // The cap lands on the scrolling body, but it is the whole box that has
      // to fit — so take off the padding and border around it. Chrome does not
      // depend on the body's height, so this settles in one pass.
      const chrome = bodyRef.current
        ? box.offsetHeight - bodyRef.current.offsetHeight
        : 0;
      setPos({
        left,
        // Anchored by the edge it grows away from, so the box needs no height
        // measured before it can be placed.
        offset: placement === 'above'
          ? c.height - (a.top - c.top) + OFFSET
          : a.bottom - c.top + OFFSET,
        // Tip tracks the anchor even once the box has been clamped sideways.
        tip: Math.max(8, Math.min(anchorCentre - left, width - 8)),
        maxBody: Math.max(MIN_BODY, room - chrome),
      });
    };

    place();
    const ro = new ResizeObserver(place);
    ro.observe(box);
    ro.observe(container);
    // The page scrolls under the bubble, which changes how much room is left
    // between the anchor and the viewport edge. Capture, so the scrolling
    // column's own scroll events are seen and not just the window's.
    window.addEventListener('scroll', place, { capture: true, passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor, container, placement]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (boxRef.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    // Capture phase, so a click that also re-opens the bubble elsewhere still
    // closes this one first.
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={boxRef}
      className={placement === 'above' ? 'ab ab--above' : 'ab'}
      role="dialog"
      style={
        pos
          ? {
              [placement === 'above' ? 'bottom' : 'top']: pos.offset,
              left: pos.left,
              ['--ab-tip' as string]: `${pos.tip}px`,
              ['--ab-max-h' as string]: `${pos.maxBody}px`,
            }
          : { visibility: 'hidden' }
      }
    >
      <button className="ab-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      {/* The scroll lives on the inner box: .ab has to stay unclipped or it
          would cut off its own tip. */}
      <div className="ab-body" ref={bodyRef}>{children}</div>
    </div>
  );
};

export default AnchoredBubble;
