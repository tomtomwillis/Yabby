import React, { useState } from 'react';
import Header from '../components/basic/Header';
import MessageBoard from '../components/MessageBoard';
import BoardsRail from '../components/BoardsRail';
import Tips from '../components/basic/Tips';
import NowWatching from '../components/film/NowWatching';
import './MessageBoardPage.css';

const tips: React.ComponentProps<typeof Tips>[] = [
  {
    text: <><span className="mb-tip-mark">tip ▸</span> long press or hover over the heart to see who reacted</>,
    showOnMobile: true,
    showOnDesktop: false,
  },
  {
    text: <><span className="mb-tip-mark">tip ▸</span> tick the box under the field to put your post on the message board too</>,
    showOnMobile: true,
    showOnDesktop: true,
  },
];

const FilmClubMessagePage: React.FC = () => {
  const [tip] = useState(() => tips[Math.floor(Math.random() * tips.length)]);

  return (
    <div className="app-container mb-board">
      <div className="mb-shell">
        <div className="mb-column">
          <Header title="Film Club Chat" subtitle="Discuss This Month's Film" />

          <NowWatching />

          <Tips {...tip} />

          <MessageBoard
            enableReactions={true}
            enableReplies={true}
            showPosterStats={true}
            showComposerAvatar={true}
            replyPreviewCount={2}
            ledger={true}
            enableCrossPost={true}
            collectionName="filmClubMessages"
            listHeader={
              <div className="mb-board-bar">
                <span className="mb-board-bar-label">threads</span>
                <span className="mb-board-bar-rule" aria-hidden="true"></span>
                <span className="mb-board-bar-note">newest activity first</span>
              </div>
            }
          />
        </div>

        <BoardsRail current="filmclub" />
      </div>
    </div>
  );
};

export default FilmClubMessagePage;
