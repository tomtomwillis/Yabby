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
import './Home.css';

// Keeps leaflet out of the eagerly loaded home chunk.
const HomeTravel = lazy(() => import('../components/travel/HomeTravel'));

const RECENTLY_ADDED_URL =
  'https://music.yabbyville.xyz/app/#/album/recentlyAdded?sort=recently_added&order=DESC&filter={}';

interface SectionProps {
  title: string;
  /** Where the title links to — the heading itself is the only way through. */
  to: string;
  /** Renders the title as a plain anchor in a new tab rather than a route link. */
  external?: boolean;
  /** Optional control sitting in the heading itself, before the rule. */
  extra?: React.ReactNode;
  children: React.ReactNode;
}

/** A heading whose title links onward and whose rule fills the remaining width. */
const Section: React.FC<SectionProps> = ({ title, to, external, extra, children }) => (
  <section className="hp-sec">
    <h2 className="hp-h">
      {external ? (
        <a className="hp-h-t" href={to} target="_blank" rel="noopener noreferrer">{title}</a>
      ) : (
        <Link className="hp-h-t" to={to}>{title}</Link>
      )}
      {extra}
      <span className="hp-h-rule" aria-hidden="true" />
    </h2>
    {children}
  </section>
);

/** What `/` shows inside the home shell. The rail, wordmark and player belong to
 *  the shell, so this is only the body content. */
function HomeDashboard() {
  const [stickerFormOpen, setStickerFormOpen] = useState(false);
  const [stickerOrder, setStickerOrder] = useState<StickerOrder>('recent');
  const stickersRef = useRef<CarouselStickersHandle>(null);

  const handleStickerPlaced = (payload: PlacedStickerPayload) => {
    stickersRef.current?.injectSticker(payload);
  };

  return (
    <>
      <Section
        title="✦ stickers"
        to="/stickers"
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

      <Section title="♫ recently added" to={RECENTLY_ADDED_URL} external>
        <CarouselAlbums />
      </Section>

      <div className="home-row2">
        <Section title="≡ recent lists" to="/lists">
          <RecentLists />
        </Section>

        <Section title="⚑ travel" to="/travel">
          <Suspense fallback={<p className="hp-note">loading map…</p>}>
            <HomeTravel />
          </Suspense>
        </Section>
      </div>
    </>
  );
}

export default HomeDashboard;
