import React, { useState } from 'react';
import Header from '../components/basic/Header';
import MessageBoard from '../components/MessageBoard';
import Tips from '../components/basic/Tips';
import './MessageBoardPage.css';

const tips: React.ComponentProps<typeof Tips>[] = [
  {
    text: <><span className="mb-tip-mark">tip ▸</span> long press or hover over the heart to see who reacted</>,
    showOnMobile: true,
    showOnDesktop: false,
  },
  {
    text: <><span className="mb-tip-mark">tip ▸</span> type <code>@</code> to tag artists &amp; albums, or <code>/</code> to tag lists, travel recs and more</>,
    showOnMobile: true,
    showOnDesktop: true,
  },
];

/* The board index. Nothing behind it yet — every thread still lives in the one
   collection — so it is drawn but not navigable, with the board you are on
   marked. */
const BOARDS = ['general', 'news', 'film club'];

const MessageBoardPage: React.FC = () => {
  const [tip] = useState(() => tips[Math.floor(Math.random() * tips.length)]);

  return (
    <div className="app-container mb-board">
      <div className="mb-shell">
        <div className="mb-column">
          <Header title="Message Board" subtitle="Get Chatty" />

          <Tips {...tip} />

          <MessageBoard
            enableReactions={true}
            enableReplies={true}
            showPosterStats={true}
            showComposerAvatar={true}
            replyPreviewCount={2}
            ledger={true}
            listHeader={
              <div className="mb-board-bar">
                <span className="mb-board-bar-label">threads</span>
                <span className="mb-board-bar-rule" aria-hidden="true"></span>
                <span className="mb-board-bar-note">newest activity first</span>
              </div>
            }
          />
        </div>

        <aside className="mb-boards" aria-label="Boards">
          <p className="mb-boards-heading">
            <span>boards</span>
            <span className="mb-boards-rule" aria-hidden="true"></span>
          </p>
          <ul className="mb-boards-list">
            {BOARDS.map((board, i) => (
              <li key={board} className={board === 'general' ? 'current' : undefined}>
                <span className="mb-boards-tree" aria-hidden="true">
                  {i === BOARDS.length - 1 ? '└─' : '├─'}
                </span>
                <span className="mb-boards-name">{board}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
};

export default MessageBoardPage;
