import { Link } from 'react-router-dom';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Header from '../components/basic/Header';
import AsciiTitle from '../components/basic/AsciiTitle';
import AsciiMan from '../components/AsciiMan';
import CarouselAlbums from '../components/CarouselAlbums';
import CarouselStickers, { type CarouselStickersHandle } from '../components/CarouselStickers';
import HomeIndex from '../components/HomeIndex';
import PlaceSticker from '../components/PlaceSticker';
import type { PlacedStickerPayload } from '../components/PlaceStickerCore';
import RadioPlayer from '../components/RadioPlayer';
import RecentLists from '../components/RecentLists';
import Weather from '../components/weather-app';
import { useStickerPlayer } from '../utils/useStickerPlayer';
import '../App.css';
import '../components/basic/TextAnimations.css';
import './Home.css';

const Stats = lazy(() => import('../components/Stats'));
const WeathrAnimation = lazy(() => import('../components/weathr/WeathrAnimation'));
// Keeps leaflet out of the eagerly loaded home chunk.
const HomeTravel = lazy(() => import('../components/travel/HomeTravel'));

const RECENTLY_ADDED_URL =
  'https://music.yabbyville.xyz/app/#/album/recentlyAdded?sort=recently_added&order=DESC&filter={}';

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

interface SectionProps {
  n: string;
  title: string;
  /** Optional control sitting in the heading itself, before the rule. */
  extra?: React.ReactNode;
  /** Optional link rendered at the far right of the section rule. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/** A numbered heading whose rule runs out to fill the remaining width. */
const Section: React.FC<SectionProps> = ({ n, title, extra, action, children }) => (
  <section className="hp-sec">
    <h2 className="hp-h">
      <span className="hp-h-n">{n}</span>
      <span className="hp-h-t">{title}</span>
      {extra}
      <span className="hp-h-rule" aria-hidden="true" />
      {action && <span className="hp-h-link">{action}</span>}
    </h2>
    {children}
  </section>
);

interface SideSectionProps {
  /** Box character joining this block to the index tree above it. */
  branch: string;
  title: string;
  children: React.ReactNode;
}

/** Sidebar equivalent of Section: a box-drawing branch, a label, then a rule
 *  that fills the rest of the rail. */
const SideSection: React.FC<SideSectionProps> = ({ branch, title, children }) => (
  <section className="hp-side-sec">
    <h2 className="hp-side-h">
      <span className="hp-side-branch" aria-hidden="true">{branch}</span>
      <span className="hp-side-t">{title}</span>
      <span className="hp-h-rule" aria-hidden="true" />
    </h2>
    {children}
  </section>
);

function Home() {
  const [subtitle, setSubtitle] = useState('');
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [stickerFormOpen, setStickerFormOpen] = useState(false);
  const stickersRef = useRef<CarouselStickersHandle>(null);
  const { album } = useStickerPlayer();
  // StickerMiniBar renders nothing until an album is docked, so this tracks
  // exactly when the bottom bar needs to lift clear of it.
  const docked = album ? ' is-docked' : '';

  const pageRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Stable identity — RadioPlayer calls this from an effect keyed on the prop.
  const handleRadioPlaying = useCallback((playing: boolean) => setRadioPlaying(playing), []);

  useEffect(() => {
    setSubtitle(SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)]);
  }, []);

  // How much of the viewport bottom the bar occupies — its own height plus any
  // lift over the sticker dock. Depends on the wordmark's scale and whether the
  // visualiser is open, so both columns reserve it from a measurement rather
  // than a formula. The var only drives their padding, so this cannot feed back.
  useLayoutEffect(() => {
    const bar = barRef.current;
    const page = pageRef.current;
    if (!bar || !page) return;
    const publish = () =>
      page.style.setProperty(
        '--hp-bar-h',
        `${Math.round(window.innerHeight - bar.getBoundingClientRect().top)}px`,
      );
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [docked]);

  const handleStickerPlaced = (payload: PlacedStickerPayload) => {
    stickersRef.current?.injectSticker(payload);
    stickersRef.current?.refetch();
  };

  return (
    <div className="home-page" ref={pageRef}>
      {/* The <header> itself is hidden on home — the sidebar carries the index
          and the title is pinned bottom-left. Header is still mounted for the
          burger button and mobile drawer, which are siblings of <header>. */}
      <Header title="Welcome to" subtitle={subtitle} />

      <div className="home-shell">
        <aside className="home-side">
          <HomeIndex />

          <SideSection branch="├" title="stats">
            <Suspense fallback={<p className="hp-note">counting…</p>}>
              <Stats />
            </Suspense>
          </SideSection>

          <SideSection branch="└" title="weather · gla">
            <Weather />
            <Suspense fallback={null}>
              {/* The engine fits both axes, so the grid has to be wider than
                  the frame ever is for the scale to land on the rail's width
                  rather than letterboxing inside it. */}
              <WeathrAnimation cols={100} rows={12} fontSizePx={10} />
            </Suspense>
          </SideSection>

          <p className="home-side-sub">{subtitle}</p>
        </aside>

        <main className="home-main">
          <Section
            n="[001]"
            title="✦ stickers"
            extra={
              <>
                <span className="hp-h-break" aria-hidden="true">❖</span>
                <button
                  type="button"
                  className={`hp-af${stickerFormOpen ? ' is-open' : ''}`}
                  onClick={() => setStickerFormOpen((open) => !open)}
                  aria-expanded={stickerFormOpen}
                  aria-controls="hp-sticker-form"
                >
                  <span className="hp-af-mark" aria-hidden="true">{stickerFormOpen ? '▾' : '+'}</span>
                  add your own
                  <span className="hp-af-mark" aria-hidden="true">{stickerFormOpen ? '▾' : '+'}</span>
                </button>
              </>
            }
            action={<Link to="/stickers">every sticker →</Link>}
          >
            <div
              id="hp-sticker-form"
              className={`hp-sticker-form${stickerFormOpen ? ' is-open' : ''}`}
            >
              <div className="hp-sticker-form-inner">
                <div className="hp-sticker-form-row">
                  <PlaceSticker mode="inline-url" onSuccess={handleStickerPlaced} />
                  <button
                    type="button"
                    className="hp-sticker-close"
                    onClick={() => setStickerFormOpen(false)}
                    aria-label="Close the sticker form"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
            <CarouselStickers ref={stickersRef} />
          </Section>

          <Section
            n="[002]"
            title="♫ recently added"
            action={
              <a href={RECENTLY_ADDED_URL} target="_blank" rel="noopener noreferrer">
                the whole shelf →
              </a>
            }
          >
            <CarouselAlbums />
          </Section>

          <div className="home-row2">
            <Section n="[003]" title="≡ recent lists" action={<Link to="/lists">all lists →</Link>}>
              <RecentLists />
            </Section>

            <Section n="[004]" title="⚑ travel" action={<Link to="/travel">the whole map →</Link>}>
              <Suspense fallback={<p className="hp-note">loading map…</p>}>
                <HomeTravel />
              </Suspense>
            </Section>
          </div>
        </main>
      </div>

      <div className={`home-bottom${docked}`} ref={barRef}>
        <div className="home-bottom-title">
          <span className="home-fixed-welcome">welcome to</span>
          <AsciiTitle />
        </div>

        <div className="home-bottom-radio">
          <RadioPlayer onPlayingChange={handleRadioPlaying} />
          {/* Sits on the player's top wave border, masking the glyphs behind
              him — he only moves while the stream does. */}
          <div className="home-bottom-man">
            <AsciiMan frozen={!radioPlaying} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
