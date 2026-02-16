import { Link } from 'react-router-dom';
import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import Header from '../components/basic/Header';
import '../App.css';
import '../components/basic/TextAnimations.css';
import CarouselAlbums from '../components/CarouselAlbums';
import CarouselStickers from '../components/CarouselStickers';
import PlaceSticker from '../components/PlaceSticker';
import WebampRadio from '../components/WebampRadio';
import { useRadioMetadata } from '../utils/useRadioMetadata';

// Lazy load the Stats component for better performance
const Stats = lazy(() => import('../components/Stats'));

// Pool of random subtitles
const SUBTITLES = [
  "🏴󠁧󠁢󠁳󠁣󠁴󠁿 Yes Sir, I Can Boogie 🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "We <3 you",
  "Confirmed 2000% better than Spotify",
  "Made in Britain, Paid in Britain",
  "From Glasgow to the World",
  "3000 watts of xenon strobe power!",
  "They say Glasgow's full of speccy bams",
  "Make Hardcore Happy Again",
  "Built by community, for community",
  "🇵🇸 Free Palestine!! 🇵🇸",
  "Until Forever Fades Away",
];

function App() {
  const [subtitle, setSubtitle] = useState('');
  const radioContainerRef = useRef<HTMLDivElement>(null);

  const { nowPlaying } = useRadioMetadata();
  const [webampLoading, setWebampLoading] = useState(false);
  const [webampError, setWebampError] = useState<string | null>(null);
  const [pageContentLoaded, setPageContentLoaded] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [initializePlayer, setInitializePlayer] = useState(false);

  // Animation timing (in milliseconds)
  const ANIMATION_DURATION = 1000; // 1 second - adjust this to speed up/slow down

  useEffect(() => {
    // Select a random subtitle when component mounts
    const randomSubtitle = SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)];
    setSubtitle(randomSubtitle);
  }, []);

  // Wait for page content to load before allowing Webamp to initialize
  useEffect(() => {
    // Use a small delay after mount to allow carousels and content to render
    const timer = setTimeout(() => {
      setPageContentLoaded(true);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  // Handle player toggle with animation
  const handleTogglePlayer = () => {
    if (showPlayer) {
      // CLOSE: Dispose Webamp first, then animate collapse
      setInitializePlayer(false);

      setTimeout(() => {
        setShowPlayer(false);
      }, 100); // Wait for Webamp to dispose

    } else {
      // OPEN: Animate expansion first, then initialize Webamp
      setShowPlayer(true);

      // Use requestAnimationFrame to ensure DOM update before animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // After 2 frames, DOM is ready and CSS transition will work
          setTimeout(() => {
            setInitializePlayer(true);
          }, ANIMATION_DURATION);
        });
      });
    }
  };

  return (
    <div className="app-container">
        <Header title="Welcome to YabbyVille" subtitle={subtitle} />

      <div className="title1">
        <Link to="/stickers">Stickers →</Link>
      </div>
      <CarouselStickers />

      <PlaceSticker />

      <hr />

        <div className="title1">
          <Link to="/lists">Lists →</Link> 
        </div>

        <hr />

        <div className="title1">Recently Added</div>
        <CarouselAlbums />

      <hr />

      <div className="title1">Radio</div>

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
        style={{
          margin: '1rem 0 0 15px',
          padding: '0.6rem 1.2rem',
          backgroundColor: 'var(--colour2)',
          color: 'var(--colour4)',
          border: 'none',
          borderRadius: '8px',
          fontSize: '0.9rem',
          fontFamily: 'var(--font2)',
          cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        }}
      >
        {showPlayer ? 'Close Player' : 'Show Player'}
      </button>

      {/* Container always renders, animation controlled by CSS class */}
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

      <hr />

      <div className="title1">Stats</div>
        <Suspense fallback={<div className="stats-container"><p className="normal-text">Loading stats...</p></div>}>
          <Stats />
        </Suspense>

    </div>
  );
}

export default App;
