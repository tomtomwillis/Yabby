import Header from '../components/basic/Header'; // Import the Header component
import '../App.css';
import '../components/basic/TextAnimations.css';
import CarouselAlbums from '../components/CarouselAlbums';
import Stats from '../components/Stats';
import CarouselStickers from '../components/CarouselStickers';
import PlaceSticker from '../components/PlaceSticker';

function App() {
  return (
    <div className="app-container">
        <Header title="Welcome to YabbyVille" subtitle="We <3 you" />

        <div className="title1">Stickers</div>
        <CarouselStickers />

        <PlaceSticker />

        <hr />

        <div className="title1">Recently Added</div>
        <CarouselAlbums />

        <hr />

        <div className="title1">Stats</div>
        <Stats />

    </div>
  );
}

export default App;