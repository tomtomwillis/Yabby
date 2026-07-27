import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Lightbox from './basic/Lightbox';
import { NAVIDROME_SERVER_URL, coverArtUrl } from '../utils/navidrome';
import {
  loadAlbumCard,
  loadArtistCard,
  type CardAlbum,
  type CardAlbumDetail,
  type CardArtist,
  type CardTrack,
} from '../utils/navidromeCards';
import { formatTime, useStickerPlayer } from '../utils/useStickerPlayer';
import type { CardPoint, CardRequest } from '../utils/useNavidromeCard';
import './stickerPlayer.css';
import './navidromeCard.css';

// Starting height only: once the track list loads the album card is resized to fit
// it (see sizeToContent), so a three-track single is not given the same window as a
// double album. Width stays fixed — it is the track titles that need the room.
const ALBUM_SIZE = { w: 640, h: 420 };
const ALBUM_MIN_H = 240;
const ALBUM_MAX_H = 560;
// Sized around two large covers per row — the artwork is the point of this card,
// so the grid is two wide and the rest is scrolled to.
const ARTIST_SIZE = { w: 576, h: 520 };
const MIN_SIZE = { w: 300, h: 200 };
const CURSOR_GAP = 14;
const VIEWPORT_MARGIN = 4;

// Must match grid-template-columns on .nc-releases — the expanded panel is placed
// relative to the row, so it needs to know how wide a row is.
const RELEASE_COLUMNS = 2;

// Matches the breakpoint stickerPlayer.css uses. Below it the card is a bottom
// sheet positioned entirely by CSS, so none of the JS placement runs.
const SHEET_QUERY = '(max-width: 600px)';

// Over-long on purpose: the strip is clipped to the card's width, so a frame
// that is dragged wider or resized still has edge to spare. A string sized to
// fit would leave the closing glyph stranded mid-box.
const EDGE = '─────✿'.repeat(40);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Height of an element's children. Not scrollHeight, which is floored at the
 *  element's own client height and so can never report "smaller than you are". */
function contentHeight(el: Element | null): number {
  const kids = el ? [...el.children] : [];
  if (!el || kids.length === 0) return 0;
  const top = el.getBoundingClientRect().top;
  const bottom = Math.max(...kids.map((k) => k.getBoundingClientRect().bottom));
  return bottom - top + el.scrollTop;
}

const albumLink = (id: string) => `${NAVIDROME_SERVER_URL}/app/#/album/${id}/show`;
const artistLink = (id: string) => `${NAVIDROME_SERVER_URL}/app/#/artist/${id}/show`;

/** Sit the card beside the cursor, flipping to the other side rather than
 *  hanging off the edge of the viewport. */
function place(el: HTMLElement, at: CardPoint) {
  const { offsetWidth: w, offsetHeight: h } = el;
  let x = at.x + CURSOR_GAP;
  let y = at.y + CURSOR_GAP;
  if (x + w > window.innerWidth) x = at.x - CURSOR_GAP - w;
  if (y + h > window.innerHeight) y = at.y - CURSOR_GAP - h;
  el.style.left = `${clamp(x, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, window.innerWidth - w - VIEWPORT_MARGIN))}px`;
  el.style.top = `${clamp(y, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, window.innerHeight - h - VIEWPORT_MARGIN))}px`;
}

interface MetaProps {
  album: CardAlbum;
}

/** Year and label, each only when the server returned it. */
const AlbumMeta: React.FC<MetaProps> = ({ album }) => (
  <>
    {album.year !== undefined && <span className="nc-meta">{album.year}</span>}
    {album.label && <span className="nc-meta">{album.label}</span>}
  </>
);

/** How many columns the track list needs to show every track without scrolling,
 *  measured off the pane rather than fixed in CSS. A `column-width` cannot do
 *  this: it either splits a short album across half-empty columns, or reserves
 *  width for empty columns on a wide card and truncates the titles that are
 *  there. Measuring gives one full-width column until the tracks genuinely run
 *  out of vertical room, then exactly as many as they need. */
function useTrackColumns(trackCount: number): [React.RefObject<HTMLDivElement | null>, number] {
  const paneRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const measure = () => {
      const row = pane.querySelector('li');
      const rowHeight = row?.getBoundingClientRect().height ?? 0;
      if (!rowHeight || !pane.clientHeight) return;
      const perColumn = Math.max(1, Math.floor(pane.clientHeight / rowHeight));
      setColumns(Math.max(1, Math.ceil(trackCount / perColumn)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [trackCount]);

  return [paneRef, columns];
}

interface TrackListProps {
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  tracks: CardTrack[];
  columns?: number;
}

const TrackList: React.FC<TrackListProps> = ({ albumId, albumTitle, albumArtist, tracks, columns }) => {
  const { album: playing, index, playAlbum } = useStickerPlayer();
  const playingHere = playing?.id === albumId;

  return (
    <ol className="sp-tracks nc-tracks" style={columns ? { columnCount: columns } : undefined}>
      {tracks.map((track, i) => {
        const isCurrent = playingHere && index === i;
        return (
          <li key={track.id}>
            <button
              className={isCurrent ? 'sp-track is-current' : 'sp-track'}
              aria-current={isCurrent || undefined}
              onClick={() => playAlbum({ id: albumId, title: albumTitle, artist: albumArtist }, track.id)}
            >
              <span className="sp-track-cue" aria-hidden="true">{isCurrent ? '▶' : ' '}</span>
              <span className="sp-track-num">{String(track.track ?? i + 1).padStart(2, '0')}</span>
              <span className="sp-track-title">{track.title}</span>
              <span className="sp-track-dur">{formatTime(track.duration ?? 0)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
};

interface AlbumBodyProps {
  albumId: string;
  onLightbox: (url: string) => void;
  /** Reports the height the track list wants, so the frame can fit itself to it. */
  onTrackPaneHeight: (pane: HTMLElement, wanted: number) => void;
}

const AlbumCardBody: React.FC<AlbumBodyProps> = ({ albumId, onLightbox, onTrackPaneHeight }) => {
  const [album, setAlbum] = useState<CardAlbumDetail | null>(null);
  const [error, setError] = useState(false);
  const [paneRef, columns] = useTrackColumns(album?.tracks.length ?? 0);

  // One shot, as soon as the rows exist and can be measured.
  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!album || !pane) return;
    const rowHeight = pane.querySelector('li')?.getBoundingClientRect().height ?? 0;
    if (rowHeight) onTrackPaneHeight(pane, album.tracks.length * rowHeight);
  }, [album, paneRef, onTrackPaneHeight]);

  useEffect(() => {
    let cancelled = false;
    loadAlbumCard(albumId)
      .then((loaded) => { if (!cancelled) setAlbum(loaded); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [albumId]);

  if (error) return <p className="sp-status">could not load album</p>;
  if (!album) return <p className="sp-status">loading album…</p>;

  return (
    <div className="nc-album">
      <div className="nc-details">
        {album.coverArt && (
          <button
            className="nc-cover"
            onClick={() => onLightbox(coverArtUrl(album.coverArt!))}
            aria-label={`View ${album.name} cover art`}
          >
            <img src={coverArtUrl(album.coverArt, 300)} alt={`${album.name} cover art`} draggable={false} />
          </button>
        )}
        <a className="nc-title" href={albumLink(album.id)} target="_blank" rel="noopener noreferrer">
          {album.name}
        </a>
        {album.artistId ? (
          <a className="nc-artist" href={artistLink(album.artistId)} target="_blank" rel="noopener noreferrer">
            {album.artist}
          </a>
        ) : (
          <span className="nc-artist">{album.artist}</span>
        )}
        <AlbumMeta album={album} />
        <a className="nc-open-link" href={albumLink(album.id)} target="_blank" rel="noopener noreferrer">
          [View in Navidrome]
        </a>
      </div>

      <div className="nc-pane" ref={paneRef}>
        <TrackList
          albumId={album.id}
          albumTitle={album.name}
          albumArtist={album.artist}
          tracks={album.tracks}
          columns={columns}
        />
      </div>
    </div>
  );
};

interface ReleaseTracksProps {
  release: CardAlbum;
  onCollapse: () => void;
}

/** The accordion panel under a release tile. Its own component so the fetch
 *  effect unmounts with the panel when collapsed. */
const ReleaseTracks: React.FC<ReleaseTracksProps> = ({ release, onCollapse }) => {
  const [tracks, setTracks] = useState<CardTrack[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadAlbumCard(release.id)
      .then((loaded) => { if (!cancelled) setTracks(loaded.tracks); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [release.id]);

  return (
    <div className="nc-accordion">
      <div className="nc-accordion-head">
        <span className="nc-accordion-title">{release.name}</span>
        <a className="nc-accordion-link" href={albumLink(release.id)} target="_blank" rel="noopener noreferrer">
          [ Navidrome ]
        </a>
        <button className="nc-btn" onClick={onCollapse} aria-label={`Close ${release.name} track list`}>
          [ ✕ ]
        </button>
      </div>
      {/* Year and label live here rather than on the tile, so the grid stays covers. */}
      <div className="nc-accordion-meta">
        <AlbumMeta album={release} />
      </div>
      {error && <p className="sp-status">could not load tracks</p>}
      {!tracks && !error && <p className="sp-status">loading tracks…</p>}
      {tracks && (
        <TrackList
          albumId={release.id}
          albumTitle={release.name}
          albumArtist={release.artist}
          tracks={tracks}
        />
      )}
    </div>
  );
};

const ArtistCardBody: React.FC<{ artistId: string }> = ({ artistId }) => {
  const [artist, setArtist] = useState<CardArtist | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadArtistCard(artistId)
      .then((loaded) => { if (!cancelled) setArtist(loaded); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [artistId]);

  if (error) return <p className="sp-status">could not load artist</p>;
  if (!artist) return <p className="sp-status">loading artist…</p>;

  const expandedIndex = expanded ? artist.albums.findIndex((a) => a.id === expanded) : -1;
  // The panel is a full-width grid item, so placing it straight after the clicked
  // tile pushes that tile's row partner down when the tile is in the first column.
  // Anchoring it to the end of the row instead keeps the row intact either way.
  const panelAfterIndex = expandedIndex < 0
    ? -1
    : Math.min(expandedIndex - (expandedIndex % RELEASE_COLUMNS) + RELEASE_COLUMNS - 1, artist.albums.length - 1);

  return (
    <div className="nc-artist-body">
      <div className="nc-artist-head">
        {artist.coverArt && (
          <img
            className="nc-artist-img"
            src={coverArtUrl(artist.coverArt, 300)}
            alt={`${artist.name} portrait`}
            draggable={false}
          />
        )}
        <a className="nc-title" href={artistLink(artist.id)} target="_blank" rel="noopener noreferrer">
          {artist.name}
        </a>
        <span className="nc-meta">
          {artist.albums.length} {artist.albums.length === 1 ? 'release' : 'releases'}
        </span>
      </div>

      {artist.albums.length === 0 ? (
        <p className="sp-status">no releases in the library</p>
      ) : (
        <div className="nc-releases">
          {artist.albums.flatMap((release, i) => {
            const isOpen = expanded === release.id;
            const tile = (
              <button
                key={release.id}
                className={isOpen ? 'nc-release is-open' : 'nc-release'}
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : release.id)}
              >
                {release.coverArt && (
                  <img src={coverArtUrl(release.coverArt, 400)} alt="" draggable={false} />
                )}
                <span className="nc-release-name">{release.name}</span>
              </button>
            );
            if (i !== panelAfterIndex) return [tile];
            return [
              tile,
              <ReleaseTracks
                key={`${expanded}-tracks`}
                release={artist.albums[expandedIndex]}
                onCollapse={() => setExpanded(null)}
              />,
            ];
          })}
        </div>
      )}
    </div>
  );
};

interface NavidromeCardProps {
  request: CardRequest;
  onClose: () => void;
  /** True when a pinned card is already open, which suppresses the pin hint. */
  hasPinned?: boolean;
}

/** Frame for the album/artist hover cards: ASCII border, drag, resize, close.
 *  Unpinned it follows the cursor and takes no pointer events, so it can never
 *  swallow the mouseleave or click on the tag that opened it. */
const NavidromeCard: React.FC<NavidromeCardProps> = ({ request, onClose, hasPinned }) => {
  const { target, pinned, follow } = request;
  const cardRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const atRef = useRef(request.at);
  const sizedRef = useRef(false);
  const resizedRef = useRef(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [isSheet, setIsSheet] = useState(() => window.matchMedia(SHEET_QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(SHEET_QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsSheet(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const size = target.type === 'album' ? ALBUM_SIZE : ARTIST_SIZE;

  // The hint rides just above the cursor while the card sits below-right of it.
  const positionAll = useCallback((at: CardPoint) => {
    if (cardRef.current) place(cardRef.current, at);
    const hint = hintRef.current;
    if (hint) {
      const { offsetWidth: w, offsetHeight: h } = hint;
      hint.style.left = `${clamp(at.x + 16, VIEWPORT_MARGIN, window.innerWidth - w - VIEWPORT_MARGIN)}px`;
      hint.style.top = `${clamp(at.y - h - 10, VIEWPORT_MARGIN, window.innerHeight - h - VIEWPORT_MARGIN)}px`;
    }
  }, []);

  // Mount-only: the provider remounts the card on a real target change, so `at`
  // is always fresh here. Pinning must not re-place a card the user has dragged.
  useLayoutEffect(() => {
    if (isSheet) return;
    positionAll(atRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isSheet || pinned || !follow) return;
    const onMouseMove = (e: MouseEvent) => positionAll({ x: e.clientX, y: e.clientY });
    document.addEventListener('mousemove', onMouseMove);
    return () => document.removeEventListener('mousemove', onMouseMove);
  }, [isSheet, pinned, follow, positionAll]);

  useEffect(() => {
    if (!pinned) return;
    const onKey = (e: KeyboardEvent) => {
      // The lightbox has its own Escape handler; one press should not close both.
      if (e.key === 'Escape' && !lightbox) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinned, lightbox, onClose]);

  // Pointer events rather than mouse events, so one code path covers dragging
  // with a mouse and with a finger.
  // Fit the card to its track list once, on load. Skipped after any manual resize —
  // the user's size wins from then on.
  const sizeToContent = useCallback((pane: HTMLElement, wantedPaneHeight: number) => {
    const el = cardRef.current;
    if (!el || isSheet || sizedRef.current || resizedRef.current) return;
    sizedRef.current = true;
    // Everything that is not the track pane: bar, borders, padding.
    const chrome = el.getBoundingClientRect().height - pane.clientHeight;
    // Cover, title, artist, year and label can be taller than a short track list —
    // sizing to the tracks alone left them clipped behind a scrollbar.
    const details = contentHeight(el.querySelector('.nc-details'));
    const height = clamp(
      Math.round(Math.max(wantedPaneHeight, details) + chrome),
      ALBUM_MIN_H,
      Math.min(ALBUM_MAX_H, window.innerHeight - VIEWPORT_MARGIN * 2),
    );
    el.style.height = `${height}px`;
    // Re-place, or a card that grew near the bottom edge would hang off it.
    place(el, atRef.current);
  }, [isSheet]);

  const startGesture = useCallback((
    e: React.PointerEvent<HTMLElement>,
    onMove: (ev: PointerEvent, el: HTMLDivElement) => void,
  ) => {
    const el = cardRef.current;
    if (!el || isSheet) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onMove(ev, el);
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }, [isSheet]);

  const startDrag = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = cardRef.current;
    if (!el) return;
    // Capturing the pointer retargets the whole gesture — including the click that
    // follows — onto the capture element, which swallowed the close button's click.
    if ((e.target as HTMLElement).closest('button, a')) return;
    const rect = el.getBoundingClientRect();
    const grabX = e.clientX - rect.left;
    const grabY = e.clientY - rect.top;
    startGesture(e, (ev, card) => {
      card.style.left = `${clamp(ev.clientX - grabX, 0, window.innerWidth - card.offsetWidth)}px`;
      card.style.top = `${clamp(ev.clientY - grabY, 0, window.innerHeight - card.offsetHeight)}px`;
    });
  }, [startGesture]);

  const startResize = useCallback((e: React.PointerEvent<HTMLElement>) => {
    const el = cardRef.current;
    if (!el) return;
    resizedRef.current = true;
    const rect = el.getBoundingClientRect();
    startGesture(e, (ev, card) => {
      card.style.width = `${clamp(ev.clientX - rect.left, MIN_SIZE.w, window.innerWidth - rect.left)}px`;
      card.style.height = `${clamp(ev.clientY - rect.top, MIN_SIZE.h, window.innerHeight - rect.top)}px`;
    });
  }, [startGesture]);

  const label = target.type === 'album' ? 'Album' : 'Artist';
  const draggable = pinned && !isSheet;
  // Grabbing the top border is the obvious way to move a window, so the edge strip
  // and its corners drag as well as the title bar under them.
  const dragProps = draggable
    ? { onPointerDown: startDrag, style: { cursor: 'move' as const } }
    : {};

  return createPortal(
    <>
      <div
        ref={cardRef}
        className={pinned ? 'nc-card is-pinned' : 'nc-card'}
        style={isSheet ? undefined : { width: size.w, height: size.h }}
        role={pinned ? 'dialog' : 'tooltip'}
        aria-label={`${label} details`}
      >
        <span className="nc-edge nc-edge-top" aria-hidden="true" {...dragProps}>{EDGE}</span>
        <span className="nc-corner nc-corner-tl" aria-hidden="true" {...dragProps}>╭</span>
        <span className="nc-corner nc-corner-tr" aria-hidden="true" {...dragProps}>╮</span>

        <div className="nc-bar" {...dragProps}>
          <span className="nc-bar-title">✿ {label} ✿</span>
          {/* Always rendered, only hidden: swapping it for text changed the bar's
              height, so the card resized the moment it was pinned. */}
          <button
            className="nc-btn nc-close"
            onClick={onClose}
            aria-label="Close"
            aria-hidden={!pinned}
            tabIndex={pinned ? 0 : -1}
            style={pinned ? undefined : { visibility: 'hidden' }}
          >
            [ ✕ ]
          </button>
        </div>

        <div className="nc-body">
          {target.type === 'album'
            ? <AlbumCardBody albumId={target.id} onLightbox={setLightbox} onTrackPaneHeight={sizeToContent} />
            : <ArtistCardBody artistId={target.id} />}
        </div>

        <span className="nc-edge nc-edge-bottom" aria-hidden="true">{EDGE}</span>
        <span className="nc-corner nc-corner-bl" aria-hidden="true">╰</span>
        {draggable ? (
          <button
            className="nc-corner nc-corner-br nc-resize"
            onPointerDown={startResize}
            aria-label="Resize"
          >
            ◢
          </button>
        ) : (
          <span className="nc-corner nc-corner-br" aria-hidden="true">╯</span>
        )}
      </div>

      {!pinned && !hasPinned && !isSheet && (
        <div className="nc-pin-hint" ref={hintRef} aria-hidden="true">
          <span className="nc-edge nc-edge-top">{EDGE}</span>
          <span className="nc-corner nc-corner-tl">╭</span>
          <span className="nc-corner nc-corner-tr">╮</span>
          <span className="nc-pin-hint-text">✧ click to pin ✧</span>
          <span className="nc-edge nc-edge-bottom">{EDGE}</span>
          <span className="nc-corner nc-corner-bl">╰</span>
          <span className="nc-corner nc-corner-br">╯</span>
        </div>
      )}

      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </>,
    document.body,
  );
};

export default NavidromeCard;
