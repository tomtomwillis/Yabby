import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import BlockRange, { RAIL_CELL_PX, RAIL_MIN_BLOCKS } from './basic/BlockRange';

export type BoardKey = 'general' | 'news' | 'filmclub';

/* How big the board is drawn, anywhere on a continuous 0–1 range. The
   stylesheet states every length at full size and multiplies it by factors
   derived from --mb-t, each of which passes through 1 at the default — so a
   board with no setting at all is what this draws. */
const SIZE_KEY = 'mb-size';
const DEFAULT_T = 0.75;

const readStoredT = (): number => {
  try {
    /* Checked before the cast: Number(null) is 0, which is itself a valid
       position, so an unset preference would otherwise read as the smallest. */
    const raw = localStorage.getItem(SIZE_KEY);
    const stored = Number(raw);
    if (raw !== null && Number.isFinite(stored) && stored >= 0 && stored <= 1) {
      return stored;
    }
  } catch {
    // Private browsing, or storage otherwise unavailable.
  }
  return DEFAULT_T;
};

interface Board {
  key: BoardKey;
  label: string;
  href: string;
}

const BOARDS: Board[] = [
  { key: 'general', label: 'general', href: '/messageboard' },
  { key: 'news', label: 'news', href: '/news' },
  { key: 'filmclub', label: 'film club', href: '/filmclubmessage' },
];

/** One line of the tree. A board is a page, so it is a link; the issues board's
 *  two statuses are state on one page, so they are buttons instead. */
export interface RailEntry {
  key: string;
  label: string;
  href?: string;
  onSelect?: () => void;
}

interface BoardsRailProps {
  /** Which entry is the one being read. */
  current: BoardKey | string;
  /** What the tree lists. Defaults to the three conversation boards. */
  entries?: RailEntry[];
  /** The word over the tree — what the entries are a set of. */
  heading?: string;
}

/* The board index, drawn the way the left-hand site nav is: a tree of entries
   with the one you are on marked. For the conversation boards each is its own
   page and its own collection; posts ticked through to the main board are read
   there. Issues reuses the rail for its two statuses, which are the same thing
   to read — one set, one of them current — even though they are state rather
   than separate pages.

   It also carries the density setting, which is why every board page mounts it:
   the slider is what publishes --mb-t. */
const BoardsRail: React.FC<BoardsRailProps> = ({ current, entries, heading = 'boards' }) => {
  const items: RailEntry[] = entries ?? BOARDS;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sizeT, setSizeT] = useState(readStoredT);

  /* Published on the root rather than passed down: the rail sits inside the
     board it is sizing, so the value has to reach .mb-board from above it.
     Nothing else reads --mb-t, and it is deliberately left set on the way out —
     clearing it would draw the next board at the default for one frame. */
  useEffect(() => {
    document.documentElement.style.setProperty('--mb-t', String(sizeT));
  }, [sizeT]);

  /* The slider is continuous, so this runs on every frame of a drag. Only the
     custom property is touched there; storage and tracking wait for the drag to
     be let go, which is the point the reader has actually chosen a size. */
  const commitSize = () => {
    try {
      localStorage.setItem(SIZE_KEY, String(sizeT));
    } catch {
      // The size still applies for this session; it just will not be remembered.
    }
    window.umami?.track('board-size', { t: Number(sizeT.toFixed(2)) });
  };

  return (
    <aside className="mb-boards" aria-label={heading}>
      <p className="mb-boards-heading">{heading}</p>
      <ul className="mb-boards-list">
        {items.map((entry, i) => {
          const isCurrent = entry.key === current;
          return (
            <li key={entry.key} className={isCurrent ? 'current' : undefined}>
              <span className="mb-boards-tree" aria-hidden="true">
                {i === items.length - 1 ? '└─' : '├─'}
              </span>
              {entry.href ? (
                <Link
                  to={entry.href}
                  className="mb-boards-name"
                  aria-current={isCurrent ? 'page' : undefined}
                >
                  {entry.label}
                </Link>
              ) : (
                /* State, not a destination: aria-pressed rather than
                   aria-current, which would claim this is a different page. */
                <button
                  type="button"
                  className="mb-boards-name"
                  aria-pressed={isCurrent}
                  onClick={entry.onSelect}
                >
                  {entry.label}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mb-boards-settings">
        <button
          type="button"
          className={`mb-boards-settings-toggle${settingsOpen ? ' is-open' : ''}`}
          onClick={() => setSettingsOpen((open) => !open)}
          aria-expanded={settingsOpen}
          aria-controls="mb-board-settings"
        >
          settings
          <span className="mb-boards-caret" aria-hidden="true">›</span>
        </button>

        <div
          id="mb-board-settings"
          className={`mb-boards-settings-panel${settingsOpen ? ' is-open' : ''}`}
        >
          <div className="mb-boards-settings-inner">
            <div className="mb-boards-setting">
              <span className="mb-boards-setting-label">size</span>
              <BlockRange
                label="Board size"
                className="mb-boards-size"
                value={sizeT}
                max={1}
                step={0.01}
                cellPx={RAIL_CELL_PX}
                minBlocks={RAIL_MIN_BLOCKS}
                onChange={setSizeT}
                onCommit={commitSize}
              />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default BoardsRail;
