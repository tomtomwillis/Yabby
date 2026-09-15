import React, { useState } from 'react';
import Header from '../components/basic/Header';
import MessageBoard from '../components/MessageBoard';
import type { CrossPostSource } from '../components/MessageBoard';
import BoardsRail from '../components/BoardsRail';
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

/* Threads from the other two boards whose authors ticked them through to here.
   Reacting, replying and editing one of them here writes to the board it came
   from, so the thread reads the same either place. */
const CROSS_POSTS: CrossPostSource[] = [
  { collection: 'news', orderField: 'lastActivityAt', label: 'news', href: '/news', postMaxWords: 1000 },
  { collection: 'filmClubMessages', orderField: 'lastActivityAt', label: 'film club', href: '/filmclubmessage' },
];

const MessageBoardPage: React.FC = () => {
  const [tip] = useState(() => tips[Math.floor(Math.random() * tips.length)]);

  return (
    <div className="app-container mb-board">
      <div className="mb-shell">
        <div className="mb-column">
          <Header title="Message Board" subtitle="Get Chatty" />

          <BoardsRail current="general" />

          <Tips {...tip} />

          <MessageBoard
            enableReactions={true}
            enableReplies={true}
            showPosterStats={true}
            showComposerAvatar={true}
            replyPreviewCount={2}
            ledger={true}
            crossPostSources={CROSS_POSTS}
            listHeader={
              <div className="mb-board-bar">
                <span className="mb-board-bar-label">threads</span>
                <span className="mb-board-bar-rule" aria-hidden="true"></span>
                <span className="mb-board-bar-note">newest activity first</span>
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
};

export default MessageBoardPage;
