import { Link } from 'react-router-dom';
import { lazy, Suspense, useRef, useState } from 'react';
import CarouselAlbums from '../components/CarouselAlbums';
import CarouselStickers, {
  type CarouselStickersHandle,
  type StickerOrder,
} from '../components/CarouselStickers';
import PlaceSticker from '../components/PlaceSticker';
import type { PlacedStickerPayload } from '../components/PlaceStickerCore';
import RecentLists from '../components/RecentLists';
import Weather from '../components/weather-app';
import HomeFilmClub from '../components/film/HomeFilmClub';
import HomeEvents, { HomeEventsNav } from '../components/events/HomeEvents';
import { addDays, startOfWeek, todayISO, weekTitle } from '../components/events/eventTypes';
import './Home.css';

// Keeps leaflet out of the eagerly loaded home chunk.
const HomeTravel = lazy(() => import('../components/travel/HomeTravel'));
const Stats = lazy(() => import('../components/Stats'));

const RECENTLY_ADDED_URL =
  'https://music.yabbyville.xyz/app/#/album/recentlyAdded?sort=recently_added&order=DESC&filter={}';

interface SectionProps {
  icon: string;
  title: string;
  /** Where the title links to — the heading itself is the only way through.
   *  Omitted for readouts with no page of their own. */
  to?: string;
  /** Renders the title as a plain anchor in a new tab rather than a route link. */
  external?: boolean;
  /** Optional control sitting in the heading itself, before the rule. */
  extra?: React.ReactNode;
  /** Optional control at the heading's far end, after the rule. */
  end?: React.ReactNode;
  children: React.ReactNode;
}

/** A heading whose title links onward and whose rule fills the remaining width. */
const Section: React.FC<SectionProps> = ({ icon, title, to, external, extra, end, children }) => {
  const label = (
    <>
      <span className="hp-h-icon" aria-hidden="true">{icon}</span> {title}
    </>
  );
  return (
    <section className="hp-sec">
      <h2 className="hp-h">
        {!to ? (
          <span className="hp-h-t">{label}</span>
        ) : external ? (
          <a className="hp-h-t" href={to} target="_blank" rel="noopener noreferrer">{label}</a>
        ) : (
          <Link className="hp-h-t" to={to}>{label}</Link>
        )}
        {extra}
        <span className="hp-h-rule" aria-hidden="true" />
        {end}
      </h2>
      {children}
    </section>
  );
};

/** What `/` shows inside the home shell. The rail, wordmark and player belong to
 *  the shell, so this is only the body content. */
function HomeDashboard() {
  const [stickerFormOpen, setStickerFormOpen] = useState(false);
  const [stickerOrder, setStickerOrder] = useState<StickerOrder>('recent');
  const stickersRef = useRef<CarouselStickersHandle>(null);
  const [today] = useState(todayISO);
  const [eventWeek, setEventWeek] = useState(() => startOfWeek(today));

  const handleStickerPlaced = (payload: PlacedStickerPayload) => {
    stickersRef.current?.injectSticker(payload);
  };

  return (
    <>
      <Section
        icon="✦"
        title="stickers"
        to="/stickers"
        extra={
          <>
            <span className="hp-h-break" aria-hidden="true">❖</span>
            <button
              type="button"
              className="hp-af"
              onClick={() => setStickerFormOpen((open) => !open)}
              aria-expanded={stickerFormOpen}
              aria-controls="hp-sticker-form"
            >
              add your own
            </button>
            <span className="hp-h-break" aria-hidden="true">❖</span>
            <button
              type="button"
              className="hp-af"
              onClick={() =>
                setStickerOrder((order) => (order === 'recent' ? 'random' : 'recent'))
              }
            >
              {stickerOrder === 'recent' ? 'show random' : 'show recent'}
            </button>
          </>
        }
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
        <CarouselStickers ref={stickersRef} order={stickerOrder} />
      </Section>

      <Section icon="♫" title="recently added" to={RECENTLY_ADDED_URL} external>
        <CarouselAlbums />
      </Section>

      <Section
        icon="☷"
        title={weekTitle(eventWeek, today)}
        to="/calendar"
        end={
          <HomeEventsNav
            weekStart={eventWeek}
            onStep={(direction) => setEventWeek((week) => addDays(week, direction * 7))}
          />
        }
      >
        <HomeEvents weekStart={eventWeek} />
      </Section>

      <div className="home-row2">
        <Section icon="≡" title="recent lists" to="/lists">
          <RecentLists />
        </Section>

        <div className="home-readouts">
          <Section icon="∑" title="stats">
            <Suspense fallback={<p className="hp-note">counting…</p>}>
              <Stats />
            </Suspense>
          </Section>

          <Section icon="☼" title="weather">
            <Weather />
          </Section>
        </div>
      </div>

      <div className="home-row2">
        <Section icon="⚑" title="travel" to="/travel">
          <Suspense fallback={<p className="hp-note">loading map…</p>}>
            <HomeTravel />
          </Suspense>
        </Section>

        <Section icon="▶" title="film club" to="/film-club">
          <HomeFilmClub />
        </Section>
      </div>
    </>
  );
}

export default HomeDashboard;
