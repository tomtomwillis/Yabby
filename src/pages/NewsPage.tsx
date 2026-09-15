import React from 'react';
import { useAdmin } from '../utils/useAdmin';
import Header from '../components/basic/Header';
import MessageBoard from '../components/MessageBoard';
import BoardsRail from '../components/BoardsRail';
import Tips from '../components/basic/Tips';
import './MessageBoardPage.css';

const tip: React.ComponentProps<typeof Tips> = {
  text: <><span className="mb-tip-mark">tip ▸</span> news posts ticked through to the message board are tagged there — like and reply to them over there</>,
  showOnMobile: true,
  showOnDesktop: true,
};

const NewsPage: React.FC = () => {
  const { isAdmin } = useAdmin();

  return (
    <div className="app-container mb-board">
      <div className="mb-shell">
        <div className="mb-column">
          <Header title="News" subtitle="Updates & Announcements" />

          <BoardsRail current="news" />

          <Tips {...tip} />

          {/* Announcements, not a conversation: only admins get the composer,
              and nobody likes or replies here. A post ticked through to the
              message board is where it gets talked about — the rules allow
              both there, and both land back on the post itself. */}
          <MessageBoard
            collectionName="news"
            enableReactions={false}
            enableReplies={false}
            showPosterStats={true}
            showComposerAvatar={true}
            ledger={true}
            showComposer={isAdmin}
            enablePolls={false}
            enableFilmAnnounce={false}
            enableCrossPost={true}
            composerPlaceholder="Write a news post..."
            postMaxWords={1000}
            postMaxChars={5000}
            listHeader={
              <div className="mb-board-bar">
                <span className="mb-board-bar-label">posts</span>
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

export default NewsPage;
