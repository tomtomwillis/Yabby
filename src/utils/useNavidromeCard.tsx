import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import NavidromeCard from '../components/NavidromeCard';

export interface CardTarget {
  type: 'album' | 'artist';
  id: string;
}

export interface CardPoint {
  x: number;
  y: number;
}

export interface CardRequest {
  target: CardTarget;
  /** Where to place the card initially — the cursor, or the link's rect for keyboard focus. */
  at: CardPoint;
  pinned: boolean;
  /** Track the cursor after opening. False for keyboard focus, where there is no cursor to track. */
  follow: boolean;
}

interface NavidromeCardValue {
  open: (request: CardRequest) => void;
  /** Scoped when a target is given: hovering out of one tag must not close another tag's
   *  pinned card. Unscoped (no argument) closes everything. */
  close: (target?: CardTarget) => void;
}

const NavidromeCardContext = createContext<NavidromeCardValue | null>(null);

const sameTarget = (a: CardTarget, b: CardTarget) => a.type === b.type && a.id === b.id;

/** Holds the open album/artist cards. At most one is pinned; a hover card can sit on
 *  top of it and is thrown away on mouse-out, which is what makes the pinned one
 *  survive a sweep across the other tags in the same message. Both are rendered
 *  rather than swapped, so the pinned card keeps whatever position and size it was
 *  dragged to instead of being remounted. */
export const NavidromeCardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pinned, setPinned] = useState<CardRequest | null>(null);
  const [hover, setHover] = useState<CardRequest | null>(null);
  // Read inside `open` without making it a dependency: the tag links hold this
  // callback, and re-creating it on every pin would re-render all of them.
  const pinnedRef = useRef<CardRequest | null>(null);
  pinnedRef.current = pinned;

  const open = useCallback((next: CardRequest) => {
    if (next.pinned) {
      setPinned(next);
      setHover(null);
      return;
    }
    // Hovering the tag that is already pinned leaves it alone: re-opening it as a
    // hover card would un-pin it and it would then vanish on mouse-out.
    if (pinnedRef.current && sameTarget(pinnedRef.current.target, next.target)) return;
    setHover(next);
  }, []);

  const close = useCallback((target?: CardTarget) => {
    if (!target) {
      setPinned(null);
      setHover(null);
      return;
    }
    setHover((current) => (current && sameTarget(current.target, target) ? null : current));
  }, []);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <NavidromeCardContext.Provider value={value}>
      {children}
      {pinned && (
        <NavidromeCard
          key={`pinned:${pinned.target.type}:${pinned.target.id}`}
          request={pinned}
          onClose={() => close()}
        />
      )}
      {hover && (
        <NavidromeCard
          key={`hover:${hover.target.type}:${hover.target.id}`}
          request={hover}
          hasPinned={!!pinned}
          onClose={() => close()}
        />
      )}
    </NavidromeCardContext.Provider>
  );
};

export function useNavidromeCard(): NavidromeCardValue {
  const ctx = useContext(NavidromeCardContext);
  if (!ctx) throw new Error('useNavidromeCard must be used inside NavidromeCardProvider');
  return ctx;
}
