import { useState, useEffect, useRef } from 'react';
import Header from '../components/basic/Header';
import WebampRadio from '../components/WebampRadio';
import { useRadioMetadata } from '../utils/useRadioMetadata';
import '../App.css';

function Radio() {
  const radioContainerRef = useRef<HTMLDivElement>(null);
  const { nowPlaying } = useRadioMetadata();
  const [webampLoading, setWebampLoading] = useState(false);
  const [webampError, setWebampError] = useState<string | null>(null);
  const [pageContentLoaded, setPageContentLoaded] = useState(false);
  const [showPlayer, setShowPlayer] = useState(true);
  const [initializePlayer, setInitializePlayer] = useState(false);

  const ANIMATION_DURATION = 500;

  useEffect(() => {
    const timer = setTimeout(() => {
      setPageContentLoaded(true);
      setInitializePlayer(true);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const handleTogglePlayer = () => {
    if (showPlayer) {
      setInitializePlayer(false);
      setTimeout(() => {
        setShowPlayer(false);
      }, 100);
    } else {
      setShowPlayer(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(() => {
            setInitializePlayer(true);
          }, ANIMATION_DURATION);
        });
      });
    }
  };

  return (
    <div className="app-container">
      <Header title="Radio" subtitle="live from yabbyville" />

      {webampLoading && (
        <p className="webamp-radio-loading">Loading player...</p>
      )}

      {webampError && (
        <p className="webamp-radio-error">{webampError}</p>
      )}

      {nowPlaying && (
        <div className="webamp-radio-now-playing">
          Now Playing: {nowPlaying}
        </div>
      )}

      <button
        className="webamp-radio-toggle"
        onClick={handleTogglePlayer}
        disabled={!pageContentLoaded}
      >
        {showPlayer ? 'Close Player' : 'Show Player'}
      </button>

      <div
        ref={radioContainerRef}
        className={`webamp-radio-container ${showPlayer ? 'expanded' : ''}`}
        style={{ marginTop: '1rem' }}
      />

      {pageContentLoaded && initializePlayer && (
        <WebampRadio
          containerRef={radioContainerRef}
          onLoadingChange={setWebampLoading}
          onErrorChange={setWebampError}
        />
      )}
    </div>
  );
}

export default Radio;
