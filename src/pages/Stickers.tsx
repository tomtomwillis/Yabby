import React, { useState, useCallback } from 'react';
import Header from '../components/basic/Header';
import StickerGrid from '../components/StickerGrid';
import type { StickerUser } from '../components/StickerGrid';
import PlaceSticker from '../components/PlaceSticker';
import '../App.css';
import './Stickers.css';

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
    <div className="app-container st-page">
      <Header title="Stickers" subtitle="All albums with stickers" />

      <div className="st-place">
        <PlaceSticker mode="inline-url" />
      </div>

      {/* The sort and the filter stated on one line of type: both orders shown
          rather than hidden behind a control, and the one dropdown the page
          keeps because the list of people is as long as the membership. */}
      <div className="st-bar">
        <span className="st-bar-key">sort</span>
        <span className="st-sort">
          <button
            type="button"
            className={`st-opt${sortMode === 'chronological' ? ' is-sel' : ''}`}
            onClick={handleNewestFirst}
          >
            newest
          </button>
          <span className="st-sep" aria-hidden="true">/</span>
          <button
            type="button"
            className={`st-opt${sortMode === 'shuffle' ? ' is-sel' : ''}`}
            onClick={handleShuffle}
          >
            shuffle
          </button>
        </span>

        {availableUsers.length > 0 && (
          <>
            <span className="st-bar-key">by</span>
            <select
              className="st-select"
              value={filterUserId}
              onChange={(e) => setFilterUserId(e.target.value)}
              aria-label="Filter by member"
            >
              <option value="">everyone</option>
              {availableUsers.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.username}
                </option>
              ))}
            </select>
          </>
        )}

        <span className="st-bar-rule" aria-hidden="true"></span>
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
