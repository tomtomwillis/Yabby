import { Link } from 'react-router-dom'; // Import Link from react-router-dom
import { lazy, Suspense } from 'react';
import Header from '../components/basic/Header'; // Import the Header component
import '../App.css';
import '../components/basic/TextAnimations.css';
import CarouselAlbums from '../components/CarouselAlbums';
import CarouselStickers from '../components/CarouselStickers';
import PlaceSticker from '../components/PlaceSticker';

// Lazy load the Stats component for better performance
const Stats = lazy(() => import('../components/Stats'));

function App() {
  return (
    <div className="app-container">
        <Header title="Welcome to YabbyVille" subtitle="🏴󠁧󠁢󠁳󠁣󠁴󠁿 Yes Sir, I Can Boogie 🏴󠁧󠁢󠁳󠁣󠁴󠁿" />

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