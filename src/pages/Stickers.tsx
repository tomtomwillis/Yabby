import React, { useState, useCallback } from 'react';
import Header from '../components/basic/Header';
import StickerGrid from '../components/StickerGrid';
import type { StickerUser } from '../components/StickerGrid';
import Button from '../components/basic/Button';
import PlaceSticker from '../components/PlaceSticker';
import '../App.css';

const Stickers: React.FC = () => {
  const [sortMode, setSortMode] = useState<'chronological' | 'shuffle'>('chronological');
  const [shuffleKey, setShuffleKey] = useState<number>(0);
  const [filterUserId, setFilterUserId] = useState<string>('');
  const [availableUsers, setAvailableUsers] = useState<StickerUser[]>([]);

  const handleNewestFirst = () => {
    setSortMode('chronological');
  };

  const handleShuffle = () => {
    setSortMode('shuffle');
    setShuffleKey(prev => prev + 1);
  };

  const handleUsersLoaded = useCallback((users: StickerUser[]) => {
    setAvailableUsers(users);
  }, []);

  return (
    <div className="app-container">
      <Header title="Stickers" subtitle="All albums with stickers" />

      <div style={{
        maxWidth: '70%',
        margin: '0 auto 2rem auto',
        padding: '0 1rem'
      }}>
        <PlaceSticker mode="inline-url" />
      </div>

      <div style={{
        display: 'flex',
        gap: '1rem',
        justifyContent: 'center',
        marginBottom: '2rem',
        flexWrap: 'wrap',
        alignItems: 'center',
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

        {availableUsers.length > 0 && (
          <select
            value={filterUserId}
            onChange={(e) => setFilterUserId(e.target.value)}
            style={{
              fontFamily: 'var(--font1)',
              fontSize: '1rem',
              color: 'var(--colour5)',
              backgroundColor: 'var(--colour4)',
              border: '2px solid var(--colour2)',
              borderRadius: '6px',
              padding: '0.4rem 0.75rem',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">All users</option>
            {availableUsers.map((user) => (
              <option key={user.userId} value={user.userId}>
                {user.username}
              </option>
            ))}
          </select>
        )}
      </div>

      <StickerGrid
        sortMode={sortMode}
        shuffleKey={shuffleKey}
        filterUserId={filterUserId || undefined}
        onUsersLoaded={handleUsersLoaded}
      />
    </div>
  );
};

export default Stickers;
