import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './AnchoredBubble.css';

type Placement = 'below' | 'above';

interface AnchoredBubbleProps {
  /** The element the bubble hangs off. */
  anchor: HTMLElement | null;
  /** Positioned ancestor the bubble is absolutely placed inside. */
  container: HTMLElement | null;
  /** Preferred side. Honoured where it fits, flipped where it does not. */
  placement?: Placement;
  onClose: () => void;
  children: React.ReactNode;
}

/** Gap between the anchor's edge and the bubble. */
const OFFSET = 10;
/** Kept clear of the viewport edge the bubble grows towards. */
const EDGE = 16;
/** Below this the bubble is too short to be worth opening scrolled. */
const MIN_BODY = 120;
/** A side with this much room is roomy enough; no need to look at the other. */
const PREFERRED_ROOM = 320;

/** How much of the viewport bottom the home shell's fixed bar covers. Measured
 *  and published on the root by Home, so it tracks the bar being minimised; 0
 *  on the pages that have no bar. */
const barHeight = () =>
  parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--hp-bar-h'),
  ) || 0;

/** Space under the anchor the bubble may occupy, stopping at the bar. */
const roomBelow = (a: DOMRect) =>
  window.innerHeight - barHeight() - a.bottom - EDGE - OFFSET;

/** Space over the anchor, stopping at the top of the viewport. */
const roomAbove = (a: DOMRect) => a.top - EDGE - OFFSET;

/** The side with the space, rather than the side the caller guessed. The
 *  preference wins ties and anything already roomy, so it only gives way when
 *  the other side is genuinely better — a tile in the last row opens upward
 *  instead of off the bottom of the screen. Both measurements come from the
 *  anchor and the viewport alone, never from the box being placed, so the
 *  choice cannot feed back into itself and flap. */
const sideFor = (a: DOMRect, preferred: Placement): Placement => {
  const preferredRoom = preferred === 'above' ? roomAbove(a) : roomBelow(a);
  if (preferredRoom >= PREFERRED_ROOM) return preferred;
  const otherRoom = preferred === 'above' ? roomBelow(a) : roomAbove(a);
  if (preferredRoom >= otherRoom) return preferred;
  return preferred === 'above' ? 'below' : 'above';
};

/** A floating box beside whatever was clicked, skinned like the travel map's
 *  pin bubble. Nothing behind it is dimmed or blocked — clicking elsewhere is
 *  what closes it. */
interface Position {
  left: number;
  tip: number;
  /** The side actually used, which may not be the one asked for. */
  side: Placement;
  /** Distance from the container's top or bottom, per side. */
  offset: number;
  /** Room the body may use before it has to scroll. */
  maxBody: number;
}

const AnchoredBubble: React.FC<AnchoredBubbleProps> = ({
  anchor, container, placement = 'below', onClose, children,
}) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const nudgedRef = useRef<HTMLElement | null>(null);
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
      // Measured against the viewport, not the container: the container is
      // usually far shorter than the space the bubble can use. Downward stops
      // at the fixed bar rather than the viewport edge — anything below that
      // line is painted over by chrome the bubble sits under.
      const side = sideFor(a, placement);
      const room = side === 'above' ? roomAbove(a) : roomBelow(a);
      // The cap lands on the scrolling body, but it is the whole box that has
      // to fit — so take off the padding and border around it. Chrome does not
      // depend on the body's height, so this settles in one pass.
      const chrome = bodyRef.current
        ? box.offsetHeight - bodyRef.current.offsetHeight
        : 0;
      setPos({
        left,
        side,
        // Anchored by the edge it grows away from, so the box needs no height
        // measured before it can be placed.
        offset: side === 'above'
          ? c.height - (a.top - c.top) + OFFSET
          : a.bottom - c.top + OFFSET,
        // Tip tracks the anchor even once the box has been clamped sideways.
        tip: Math.max(8, Math.min(anchorCentre - left, width - 8)),
        maxBody: Math.max(MIN_BODY, room - chrome),
      });
    };

    place();

    // Last resort, for a viewport too short to hold the bubble on either side
    // of the anchor: flipping cannot help, so move the anchor instead. The
    // scroll listener below re-places as it travels, so the body grows into
    // the room that opens up. Once per anchor, so re-placing can never drive
    // it again.
    if (nudgedRef.current !== anchor) {
      nudgedRef.current = anchor;
      const a = anchor.getBoundingClientRect();
      if (Math.max(roomAbove(a), roomBelow(a)) < PREFERRED_ROOM) {
        anchor.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }

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

  // Before the first measurement there is no chosen side, and the box is
  // hidden anyway; the preference is the best guess until then.
  const side = pos?.side ?? placement;

  return (
    <div
      ref={boxRef}
      className={side === 'above' ? 'ab ab--above' : 'ab'}
      role="dialog"
      style={
        pos
          ? {
              [side === 'above' ? 'bottom' : 'top']: pos.offset,
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
