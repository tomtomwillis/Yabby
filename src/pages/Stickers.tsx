import React, { useState } from 'react';
import Header from '../components/basic/Header';
import StickerGrid from '../components/StickerGrid';
import Button from '../components/basic/Button';
import '../App.css';

const Stickers: React.FC = () => {
  const [sortMode, setSortMode] = useState<'chronological' | 'shuffle'>('chronological');
  const [shuffleKey, setShuffleKey] = useState<number>(0);

  const handleNewestFirst = () => {
    setSortMode('chronological');
  };

  const handleShuffle = () => {
    setSortMode('shuffle');
    setShuffleKey(prev => prev + 1); // Increment to trigger re-shuffle
  };

  return (
    <div className="app-container">
      <Header title="Stickers" subtitle="All albums with stickers" />

      <div style={{
        display: 'flex',
        gap: '1rem',
        justifyContent: 'center',
        marginBottom: '2rem',
        flexWrap: 'wrap'
      }}>
        <Button
          type="basic"
          label="Newest First"
          onClick={handleNewestFirst}
          className={sortMode === 'chronological' ? 'active-sort-button' : ''}
        />
        <Button
          type="basic"
          label="Shuffle"
          onClick={handleShuffle}
          className={sortMode === 'shuffle' ? 'active-sort-button' : ''}
        />
      </div>

      <StickerGrid sortMode={sortMode} shuffleKey={shuffleKey} />
    </div>
  );
};

export default Stickers;
