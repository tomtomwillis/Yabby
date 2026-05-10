import React, { useState } from 'react';
import Header from '../components/basic/Header';
import MessageBoard from '../components/MessageBoard';
import Tips from '../components/basic/Tips';
import NowWatching from '../components/film/NowWatching';

const tips: React.ComponentProps<typeof Tips>[] = [
  {
    text: '💡 Tip: long press or hover over the heart to see who reacted',
    showOnMobile: true,
    showOnDesktop: false,
  },
  {
    text: <>💡 <strong>Tip:</strong> Type <code>@</code> to tag artists/albums or use a forward slash <code>/</code> to tag lists/travel recs + more!</>,
    showOnMobile: true,
    showOnDesktop: true,
  },
];

const FilmClubMessagePage: React.FC = () => {
  const [tip] = useState(() => tips[Math.floor(Math.random() * tips.length)]);

  return (
    <div className="app-container">
      <Header title="Film Club Chat" subtitle="Discuss This Month's Film" />
      <NowWatching />
      <Tips {...tip} />
      <MessageBoard enableReactions={true} enableReplies={true} collectionName="filmClubMessages" />
    </div>
  );
};

export default FilmClubMessagePage;
