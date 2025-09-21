import React from 'react';
import Header from '../components/basic/Header';
import MessageBoard from '../components/MessageBoard';

const MessageBoardPage: React.FC = () => {
    return (
        <div className="app-container">
          <Header title="Message Board" subtitle="Get Chatty" />

          <MessageBoard />
        </div>
      );
};

export default MessageBoardPage;