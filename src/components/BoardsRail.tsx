import React from 'react';
import { Link } from 'react-router-dom';

export type BoardKey = 'general' | 'news' | 'filmclub';

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
const BoardsRail: React.FC<{ current: BoardKey }> = ({ current }) => (
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
  </aside>
);

export default BoardsRail;
