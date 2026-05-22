import { Link } from 'react-router-dom';
import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import Moveable from 'react-moveable';
import Header from '../components/basic/Header';
import '../App.css';
import './Home.css';
import '../components/basic/TextAnimations.css';
import CarouselAlbums from '../components/CarouselAlbums';
import CarouselStickers, { type CarouselStickersHandle } from '../components/CarouselStickers';
import PlaceSticker from '../components/PlaceSticker';
import type { PlacedStickerPayload } from '../components/PlaceStickerCore';
import WebampRadio from '../components/WebampRadio';
import RecentLists from '../components/RecentLists';
import RecentNews from '../components/RecentNews';
import { useRadioMetadata } from '../utils/useRadioMetadata';
import AsciiMan from '../components/AsciiMan';
import AsciiTitle from '../components/basic/AsciiTitle';
import Weather from '../components/weather-app';

const Stats = lazy(() => import('../components/Stats'));
const WeathrAnimation = lazy(() => import('../components/weathr/WeathrAnimation'));

const SUBTITLES = [
  "🏴󠁧󠁢󠁳󠁣󠁴󠁿 Yes Sir, I Can Boogie 🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "We <3 you",
  "Confirmed 2000% better than Spotify",
  "Made in Britain, Paid in Britain",
  "From Glasgow to the World",
  "3000 watts of xenon strobe power!",
  "They say Glasgow's full of speccy bams",
  "Make Hardcore Happy Again",
  "I just fucking love files",
  "Built by community, for community",
  "🇵🇸 Free Palestine!! 🇵🇸",
  "Until Forever Fades Away",
  "And if I asked you to stop me from falling, Would you save me?",
  "Hardcore will never die, but you will",
  "Don't be daft, take a half",
  "Because steel is heavier than feathers",
  "Benny Harvey RIP",
  "Excellent value for money!",
  "My face is the front of shop",
  "Recommended by 9 out of 10 dentists",
  "Final release moving fast!",
  "Archival maintenence is a radical practice",
  "Maximum Volume yields Maximum Results",
  "Do Not Look Directly At The Strobe",
  "for f in *.flac; do ffmpeg -i \"$f\" -b:a 320k \"${f%.flac}.mp3\"; done",
  "Put a banging donk on it",
  "Big Things Coming Soon",
  "Home of the Business Techno Industrial Complex™",
  "Big beats are the best, get high all the time",
  "bida bup bup - oooh ooooh",
  "Skeng",
  "slowed and reverbed.....",
  "On the charge with Minaj",
  "One More Tune",
  "chopped 'N' screwed",
  "Keep Honking!! I'm Listening to Alice Coltranes 1971 Meteoric Sensation 'Universal Consciousness'.",
  "Stay lossless",
  "Soulseek for my Salvation",
  "You Can't Hide Your Love (Hidden Love mix)",
  "Scream if you want to go faster",
  "Seed what you reap",
  "Hard Drum 4ever",
  "Deconstruct This!",
  "You have to trust the future will be a little bit sexy",
  "┌∩┐(◣_◢)┌∩┐",
  "Ƹ̵̡Ӝ̵̨̄Ʒ",
  "°º¤ø,¸¸,ø¤º°`°º¤ø,¸,ø¤°º¤ø,¸¸,ø¤º°`°º¤ø,¸",
  "peer to peer, dust to dust",
];

function App() {
  const [subtitle, setSubtitle] = useState('');
  const radioContainerRef = useRef<HTMLDivElement>(null);
  const stickersRef = useRef<CarouselStickersHandle>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (editMode) {
      document.body.classList.add('design-mode');
    } else {
      document.body.classList.remove('design-mode');
      setSelectedTarget(null);
    }
    return () => {
      document.body.classList.remove('design-mode');
    };
  }, [editMode]);

  const onPanelClick = (e: React.MouseEvent<HTMLFieldSetElement>) => {
    if (!editMode) return;
    e.stopPropagation();
    setSelectedTarget(e.currentTarget);
  };

  const onCanvasClick = () => {
    if (editMode) setSelectedTarget(null);
  };

  const handleStickerPlaced = (payload: PlacedStickerPayload) => {
    stickersRef.current?.injectSticker(payload);
    stickersRef.current?.refetch();
  };

  const { nowPlaying } = useRadioMetadata();
  const [webampLoading, setWebampLoading] = useState(false);
  const [webampError, setWebampError] = useState<string | null>(null);
  const [pageContentLoaded, setPageContentLoaded] = useState(false);

  useEffect(() => {
    setSubtitle(SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)]);
  }, []);

  const handleLatestNewsTimestamp = (timestampMs: number | null) => {
    if (timestampMs && Date.now() - timestampMs < 48 * 60 * 60 * 1000) {
      setSubtitle('Fresh News!');
    }
  };

  // Defer Webamp init until the rest of the page has had a chance to render.
  useEffect(() => {
    const timer = setTimeout(() => {
      setPageContentLoaded(true);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="app-container home-page" onClick={onCanvasClick}>
      <Header
        title="Welcome to"
        subtitle={subtitle}
        belowTitle={<AsciiTitle />}
      />

      <button
        type="button"
        className="design-toggle"
        onClick={(e) => { e.stopPropagation(); setEditMode((v) => !v); }}
      >
        {editMode ? 'done' : '🎨 design mode'}
      </button>

      <div className="home-grid">
        {/* ── LEFT ── Stickers + Weather stacked */}
        <div className="home-col home-col--left">
          <fieldset className="panel panel--stickers" onClick={onPanelClick}>
            <legend>
              <Link to="/stickers">[ stickers → ]</Link>
            </legend>
            <CarouselStickers ref={stickersRef} />
            <div className="panel-cta">
              <PlaceSticker onSuccess={handleStickerPlaced} />
            </div>
          </fieldset>

          <fieldset className="panel panel--weather" onClick={onPanelClick}>
            <legend>[ weather ]</legend>
            <div className="weather-strip">
              <Weather />
            </div>
            <Suspense fallback={<p className="normal-text">…</p>}>
              <WeathrAnimation />
            </Suspense>
          </fieldset>
        </div>

        {/* ── RIGHT ── Recently Added (full row), then Lists|Radio, then News|Stats */}
        <div className="home-col home-col--right">
          <fieldset className="panel panel--recent" onClick={onPanelClick}>
            <legend>
              <a href="https://music.yabbyville.xyz/app/#/album/recentlyAdded?sort=recently_added&order=DESC&filter={}">
                [ recently added → ]
              </a>
            </legend>
            <CarouselAlbums />
          </fieldset>

          <div className="home-right-grid">
            <div className="home-subcol home-subcol--inner">
              <fieldset className="panel panel--lists" onClick={onPanelClick}>
                <legend>
                  <Link to="/lists">[ lists → ]</Link>
                </legend>
                <RecentLists />
              </fieldset>

              <fieldset className="panel panel--news news-inverted" onClick={onPanelClick}>
                <legend>
                  <Link to="/news">[ news → ]</Link>
                </legend>
                <RecentNews onLatestTimestamp={handleLatestNewsTimestamp} />
              </fieldset>
            </div>

            <div className="home-subcol home-subcol--outer">
              <fieldset className="panel panel--radio" onClick={onPanelClick}>
                <legend>
                  <Link to="/radio">[ on the radio → ]</Link>
                </legend>

                {webampError && (
                  <p className="webamp-radio-error">{webampError}</p>
                )}
                {webampLoading && (
                  <p className="webamp-radio-loading">tuning in...</p>
                )}

                <div
                  ref={radioContainerRef}
                  className="webamp-radio-container expanded"
                />

                {pageContentLoaded && (
                  <WebampRadio
                    containerRef={radioContainerRef}
                    onLoadingChange={setWebampLoading}
                    onErrorChange={setWebampError}
                  />
                )}

                {nowPlaying && (
                  <div className="webamp-radio-now-playing">
                    ♪ now playing: {nowPlaying}
                  </div>
                )}
              </fieldset>

              <fieldset className="panel panel--stats" onClick={onPanelClick}>
                <legend>[ stats ]</legend>
                <Suspense fallback={<p className="normal-text">Loading stats...</p>}>
                  <Stats />
                </Suspense>
              </fieldset>
            </div>
          </div>
        </div>
      </div>

      <AsciiMan />

      {editMode && selectedTarget && (
        <Moveable
          target={selectedTarget}
          draggable
          scalable
          origin={false}
          throttleScale={0}
          onDrag={({ target, transform }) => {
            (target as HTMLElement).style.transform = transform;
          }}
          onScale={({ target, drag }) => {
            (target as HTMLElement).style.transform = drag.transform;
          }}
        />
      )}
    </div>
  );
}

export default App;
