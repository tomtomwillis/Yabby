import { Outlet, useLocation } from 'react-router-dom';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Header from '../components/basic/Header';
import AsciiTitle from '../components/basic/AsciiTitle';
import AsciiMan from '../components/AsciiMan';
import HomeIndex from '../components/HomeIndex';
import PlayerBar from '../components/PlayerBar';
import VisualiserDock from '../components/VisualiserDock';
import Weather from '../components/weather-app';
import { usePlayerState } from '../utils/usePlayer';
import { scrollPageTo } from '../utils/pageScroll';
import '../App.css';
import '../components/basic/TextAnimations.css';
import './Home.css';

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

/* Repeated to fill the bar's width and clipped by overflow. The wave comes from
   the glyphs' own heights rather than per-character transforms, so it costs one
   text node instead of a few hundred spans. */
const RULE_MOTIF = '·˚⋆~✦~⋆˚·☆';
const RULE_REPEATS = 60;

/* Below this the bar is the transport and nothing else — the width left over
   for a visualiser is a few pixels of nothing. Mirrored by .pb-mode--viz in
   PlayerBar.css, which hides the switch at the same point. */
const VIZ_QUERY = '(min-width: 901px)';

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

/** The persistent shell: rail, wordmark and player stay put while routes swap
 *  through <Outlet /> in the body column. */
function Home() {
  const [subtitle, setSubtitle] = useState('');
  const [minimised, setMinimised] = useState(false);
  const { isPlaying, vizOpen, vizFullscreen } = usePlayerState();
  const { pathname } = useLocation();

  const isHome = pathname === '/';

  const barRef = useRef<HTMLDivElement>(null);

  // Gated in JS rather than hidden in CSS: a display:none dock still mounts,
  // and mounting it is what pulls in butterchurn and starts a WebGL loop the
  // phone would never show. The switch in the player bar hides at the same width.
  const [wideEnoughForViz, setWideEnoughForViz] = useState(
    () => window.matchMedia(VIZ_QUERY).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(VIZ_QUERY);
    const onChange = (e: MediaQueryListEvent) => setWideEnoughForViz(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setSubtitle(SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)]);
  }, []);

  // A route change would otherwise land halfway down the new page. Which
  // element actually scrolls depends on the width — the body column on desktop,
  // the window once the shell stacks — so this asks rather than assuming.
  useEffect(() => {
    scrollPageTo({ top: 0 });
  }, [pathname]);

  // How much of the viewport bottom the bar occupies. Depends on the wordmark's
  // scale and on how tall the player lays out, so everything that has to clear
  // it reserves it from a measurement rather than a formula. Published on the
  // root so portalled chrome can read it too; it only drives padding, so this
  // cannot feed back.
  const publishBarHeight = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    document.documentElement.style.setProperty(
      '--hp-bar-h',
      `${Math.round(window.innerHeight - bar.getBoundingClientRect().top)}px`,
    );
  }, []);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    publishBarHeight();
    const ro = new ResizeObserver(publishBarHeight);
    ro.observe(bar);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--hp-bar-h');
    };
  }, [publishBarHeight]);

  // Minimising or expanding reflows the bar synchronously; the ResizeObserver
  // only reacts a frame later, so on the short→tall (expand) transition the
  // reserved padding would trail the grown bar and the last content would slip
  // behind it. Republish in the same layout pass as the toggle to close that
  // gap; the observer still handles the async wordmark refit that follows.
  useLayoutEffect(() => {
    publishBarHeight();
  }, [minimised, publishBarHeight]);

  return (
    <div className={`home-page${isHome ? ' is-home' : ''}`}>
      {/* The wordmark is ascii in an aria-hidden <pre> and the shell's own
          masthead is display:none, so `/` would otherwise reach a screen reader
          with no heading at all. Off `/` the routed page renders its own visible
          h1, which is the better description of where you are. */}
      {isHome && <h1 className="hp-sr">Yabbyville</h1>}

      {/* This masthead is hidden — the sidebar carries the index and the title is
          pinned bottom-left. Header is still mounted for the burger button and
          mobile drawer, which are siblings of <header>. Routed pages render their
          own Header; Home.css keeps only their title and hides the duplicate
          nav and burger. */}
      <Header title="Welcome to" subtitle={subtitle} />

      {/* Mobile's masthead. The wordmark fits itself to whichever wrapper is
          showing, so the two copies are a display swap rather than a move — only
          one is ever visible, and neither has to be told what size to be. */}
      <div className="home-top-title">
        <span className="home-fixed-welcome">welcome to</span>
        <AsciiTitle />
        <p className="home-top-sub">{subtitle}</p>
      </div>

      <div className="home-shell">
        <aside className="home-side">
          <HomeIndex />

          <SideSection branch="├" title="stats">
            <Suspense fallback={<p className="hp-note">counting…</p>}>
              <Stats />
            </Suspense>
          </SideSection>

          <SideSection branch="└" title="weather">
            <Weather />
            <Suspense fallback={null}>
              {/* Columns set how big the scene draws in the rail: fewer means
                  more pixels per glyph. 88 is close to the floor — the house is
                  64 wide and the fence needs the rest. Rows come from the
                  frame's height. */}
              <WeathrAnimation cols={88} minRows={15} fontSizePx={10} />
            </Suspense>
          </SideSection>

          <p className="home-side-sub">{subtitle}</p>
        </aside>

        <main className="home-main">
          <Outlet />
        </main>
      </div>

      <div
        className={`home-bottom${vizFullscreen ? ' is-viz-fs' : ''}${minimised ? ' home-bottom--min' : ''}`}
        ref={barRef}
      >
        {/* Arrow at each end of the star rule itself, so the toggle sits on
            the ascii border rather than a line of its own. */}
        <button
          className="home-bottom-toggle"
          onClick={() => {
            setMinimised((v) => !v);
            window.umami?.track('home_bar_minimise', { minimised: !minimised });
          }}
          aria-expanded={!minimised}
          aria-label={minimised ? 'Expand player bar' : 'Minimise player bar'}
        >
          <span className="home-bottom-toggle-mark" aria-hidden="true">{minimised ? '▲' : '▼'}</span>
          <span className="home-bottom-rule" aria-hidden="true">{RULE_MOTIF.repeat(RULE_REPEATS)}</span>
          <span className="home-bottom-toggle-mark" aria-hidden="true">{minimised ? '▲' : '▼'}</span>
        </button>

        <div className="home-bottom-inner">
          <div className="home-bottom-title">
            <span className="home-fixed-welcome">welcome to</span>
            <AsciiTitle />
          </div>

          <div className="home-bottom-radio">
            {/* Only mounted while open: an empty flex box would still take its
                share of the row's width. Sits ahead of the player here so
                justify-content: flex-end on this row packs the two of them
                together at the bar's right edge, rather than leaving the
                visualiser stranded out by the wordmark. */}
            {vizOpen && wideEnoughForViz && (
              <div className="home-bottom-viz">
                <VisualiserDock />
              </div>
            )}

            {/* Inside the transport row rather than beside the whole player, so
                he sits at the end of the controls while the seek bar and the
                metadata above still run to the bar's edge. He only moves while
                something is playing. */}
            <PlayerBar
              trailing={
                <div className="home-bottom-man">
                  <AsciiMan frozen={!isPlaying} />
                </div>
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
