import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TrackList } from './NavidromeCard';
import { loadAlbumCard, type CardTrack } from '../utils/navidromeCards';
import './stickerPlayer.css';

// Matches the breakpoint in ListItem.css where the plate stacks above the entry.
const STACKED_QUERY = '(max-width: 700px)';
// Lists can be long: tracks are fetched only as an entry comes near the screen.
const PRELOAD_MARGIN = '600px';

function useStacked(): boolean {
  const [stacked, setStacked] = useState(() => window.matchMedia(STACKED_QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(STACKED_QUERY);
    const onChange = (e: MediaQueryListEvent) => setStacked(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return stacked;
}

interface ListAlbumTracksProps {
  albumId: string;
  albumTitle: string;
  albumArtist: string;
}

/** An album entry's track list, in the room beside the plate. Side by side it is
 *  always shown, filled top to bottom and then across, scrolling sideways once
 *  the columns run out of width. Stacked it sits behind a toggle and opens
 *  downwards to fill what the screen has left under the plate. */
const ListAlbumTracks: React.FC<ListAlbumTracksProps> = ({ albumId, albumTitle, albumArtist }) => {
  const stacked = useStacked();
  const rootRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tracks, setTracks] = useState<CardTrack[] | null>(null);
  const [error, setError] = useState(false);
  const [rows, setRows] = useState(1);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setNear(true); },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near]);

  const wanted = stacked ? expanded : near;

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    setError(false);
    loadAlbumCard(albumId)
      .then((loaded) => { if (!cancelled) setTracks(loaded.tracks); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [wanted, albumId]);

  // Rows per column, from the pane's height: the grid then adds as many columns
  // as the tracks need, and the pane scrolls sideways once they outgrow it.
  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (stacked || !pane || !tracks) return;
    const measure = () => {
      const room = pane.querySelector('ol')?.clientHeight ?? 0;
      const rowHeight = pane.querySelector('li')?.getBoundingClientRect().height ?? 0;
      if (!rowHeight || !room) return;
      setRows(Math.max(1, Math.floor(room / rowHeight)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [stacked, tracks]);

  // Stacked: bring the plate to the top of the screen and let the panel take the
  // rest of it, so the cover and its tracks are what fills the view.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!stacked || !expanded || !panel || !tracks) return;
    const plate = rootRef.current?.closest('.ls-item')?.querySelector('.ls-item-thumb') ?? panel;
    const plateTop = plate.getBoundingClientRect().top;
    const above = panel.getBoundingClientRect().top - plateTop;
    panel.style.maxHeight = `${Math.max(window.innerHeight * 0.5, window.innerHeight - above - 8)}px`;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: window.scrollY + plateTop, behavior: smooth ? 'smooth' : 'auto' });
  }, [stacked, expanded, tracks]);

  const list = tracks && (
    <TrackList albumId={albumId} albumTitle={albumTitle} albumArtist={albumArtist} tracks={tracks} />
  );
  const status = error
    ? <p className="sp-status">could not load tracks</p>
    : !tracks && <p className="sp-status">loading tracks…</p>;

  if (stacked) {
    return (
      <div className="sp-player ls-tracks ls-tracks--stacked" ref={rootRef}>
        {expanded ? (
          <div className="ls-tracks-panel" ref={panelRef}>
            <div className="ls-tracks-head">
              <span>{tracks ? `${tracks.length} ${tracks.length === 1 ? 'track' : 'tracks'}` : 'tracks'}</span>
              <button
                type="button"
                className="ls-tracks-btn"
                onClick={() => setExpanded(false)}
                aria-label={`Close ${albumTitle} track list`}
              >
                [ ✕ ]
              </button>
            </div>
            <div className="ls-tracks-scroll">{status}{list}</div>
          </div>
        ) : (
          <button
            type="button"
            className="ls-tracks-btn ls-tracks-toggle"
            onClick={() => {
              setExpanded(true);
              window.umami?.track('list_album_tracks_open', { albumId });
            }}
            aria-expanded={false}
          >
            [ show tracks ]
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="sp-player ls-tracks" ref={rootRef}>
      {status}
      <div
        className="ls-tracks-pane"
        ref={paneRef}
        style={{ '--ls-track-rows': rows } as React.CSSProperties}
      >
        {list}
      </div>
    </div>
  );
};

export default ListAlbumTracks;
