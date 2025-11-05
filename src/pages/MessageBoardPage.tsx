import React from 'react';
import Header from '../components/basic/Header';
import MessageBoard from '../components/MessageBoard';
import Tips from '../components/basic/Tips';

const MessageBoardPage: React.FC = () => {
    return (
        <div className="app-container">
          <Header title="Message Board" subtitle="Get Chatty" />

          <Tips
            text="tip: long press the heart to see who reacted"
            showOnMobile={true}
            showOnDesktop={false}
          />

          <MessageBoard enableReactions={true} enableReplies={true} />
        </div>
      );
};

export default MessageBoardPage;