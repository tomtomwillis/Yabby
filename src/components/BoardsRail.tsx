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

/* The board index, drawn the way the left-hand site nav is: a tree of links
   with the one you are on marked. Each board is its own page and its own
   collection; posts ticked through to the main board are read there. */
const BoardsRail: React.FC<{ current: BoardKey }> = ({ current }) => {
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
    <aside className="mb-boards" aria-label="Boards">
      <p className="mb-boards-heading">boards</p>
      <ul className="mb-boards-list">
        {BOARDS.map((board, i) => (
          <li key={board.key} className={board.key === current ? 'current' : undefined}>
            <span className="mb-boards-tree" aria-hidden="true">
              {i === BOARDS.length - 1 ? '└─' : '├─'}
            </span>
            <Link
              to={board.href}
              className="mb-boards-name"
              aria-current={board.key === current ? 'page' : undefined}
            >
              {board.label}
            </Link>
          </li>
        ))}
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
