import { createContext } from 'react';
import type { CardPoint, CardTarget } from './useNavidromeCard';

/**
 * Set by a pinned card around its own body, so an @-tag inside it — an artist
 * in an event's lineup, an album in its description — can turn that card into
 * the tag's card in place, with a way back.
 */
export interface CardHost {
  /** The card to go back to. */
  back: CardTarget;
  /** Where the host card sits now, for the replacement to open in the same spot. */
  origin: () => CardPoint | null;
}

export const CardHostContext = createContext<CardHost | null>(null);
