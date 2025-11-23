import { Link } from 'react-router-dom';
import { lazy, Suspense, useState, useEffect } from 'react';
import Header from '../components/basic/Header';
import '../App.css';
import '../components/basic/TextAnimations.css';
import CarouselAlbums from '../components/CarouselAlbums';
import CarouselStickers from '../components/CarouselStickers';
import PlaceSticker from '../components/PlaceSticker';

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
];

function App() {
  const [subtitle, setSubtitle] = useState('');

  useEffect(() => {
    // Select a random subtitle when component mounts
    const randomSubtitle = SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)];
    setSubtitle(randomSubtitle);
  }, []);

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

        <div className="title1">Stats</div>
        <Suspense fallback={<div className="stats-container"><p className="normal-text">Loading stats...</p></div>}>
          <Stats />
        </Suspense>

    </div>
  );
}

export default App;