import React, { useEffect, useRef, useState } from 'react';
import { NAVIDROME_SERVER_URL } from '../utils/navidrome';
import {
  formatTime,
  loadAlbumTracks,
  useStickerPlayer,
  type PlayerTrack,
} from '../utils/useStickerPlayer';
import './stickerPlayer.css';

const SEEK_CELL_PX = 9;
const SEEK_MIN_BLOCKS = 16;
const VOLUME_CELL_PX = 8;
const VOLUME_MIN_BLOCKS = 6;

function blockStates(ratio: number, width: number): boolean[] {
  const filled = Math.round(Math.min(Math.max(ratio, 0), 1) * width);
  return Array.from({ length: width }, (_, i) => i < filled);
}

interface BlockRangeProps {
  label: string;
  value: number;
  max: number;
  step: number;
  cellPx: number;
  minBlocks: number;
  className?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}

// Each block is its own CSS grid cell (1fr), so the row of cells always sums to
// exactly the container's rendered width — a fixed-length unicode string doesn't,
// since its width comes from font metrics, not the flex box it sits in. Block
// *count* is measured off the container too (ResizeObserver), so a bar that's
// wide gets rendered at a proportionally higher resolution instead of the same
// handful of blocks stretched apart with gaps.
const BlockRange: React.FC<BlockRangeProps> = ({
  label, value, max, step, cellPx, minBlocks, className, disabled, onChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [blockCount, setBlockCount] = useState(minBlocks);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setBlockCount(Math.max(minBlocks, Math.round(entry.contentRect.width / cellPx)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cellPx, minBlocks]);

  const cells = blockStates(max > 0 ? value / max : 0, blockCount);
  return (
    <div ref={containerRef} className={className ? `sp-blocks ${className}` : 'sp-blocks'}>
      <span
        className="sp-blocks-glyphs"
        aria-hidden="true"
        style={{ gridTemplateColumns: `repeat(${blockCount}, 1fr)` }}
      >
        {cells.map((filled, i) => (
          <span key={i} className={filled ? 'sp-blocks-cell sp-blocks-fill' : 'sp-blocks-cell sp-blocks-rest'}>
            {filled ? '█' : '░'}
          </span>
        ))}
      </span>
      <input
        className="sp-range"
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
};

/** Play/pause, prev/next, seek bar, time and volume. Lives in the docked mini-bar. */
export const StickerTransport: React.FC = () => {
  const {
    tracks, index, isPlaying, currentTime, duration, volume,
    toggle, next, prev, seek, setVolume,
  } = useStickerPlayer();

  const idle = index < 0;

  return (
    <div className="sp-transport">
      <button
        className="sp-btn"
        onClick={prev}
        disabled={idle || index === 0}
        aria-label="Previous track"
      >
        |◀
      </button>
      <button
        className="sp-btn"
        onClick={toggle}
        disabled={idle}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '❚❚' : '▶'}
      </button>
      <button
        className="sp-btn"
        onClick={next}
        disabled={idle || index + 1 >= tracks.length}
        aria-label="Next track"
      >
        ▶|
      </button>

      <BlockRange
        label="Seek"
        value={Math.min(currentTime, duration)}
        max={duration}
        step={1}
        cellPx={SEEK_CELL_PX}
        minBlocks={SEEK_MIN_BLOCKS}
        disabled={idle || duration === 0}
        onChange={seek}
      />

      <span className="sp-time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <BlockRange
        label="Volume"
        className="sp-vol"
        value={volume}
        max={1}
        step={0.01}
        cellPx={VOLUME_CELL_PX}
        minBlocks={VOLUME_MIN_BLOCKS}
        onChange={setVolume}
      />
    </div>
  );
};

interface StickerFavoritePlayProps {
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  trackId: string;
  trackTitle?: string;
}

/** Inline ▶ beside a sticker's favourite track. A component rather than inline JSX
 *  so the 4Hz player context subscription stays out of the sticker grid's render. */
export const StickerFavoritePlay: React.FC<StickerFavoritePlayProps> = ({
  albumId, albumTitle, albumArtist, trackId, trackTitle,
}) => {
  const { playAlbum } = useStickerPlayer();
  return (
    <button
      className="sp-fav-play"
      onClick={() => playAlbum({ id: albumId, title: albumTitle, artist: albumArtist }, trackId)}
      aria-label={`Play ${trackTitle ?? 'favourite track'}`}
    >
      ▶
    </button>
  );
};

interface StickerAlbumPlayerProps {
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  favoriteTrackIds?: string[];
}

/** Accordion in the sticker popup: expands to the album's track list. Clicking a
 *  track starts it playing in the persistent bottom dock (StickerMiniBar) — the
 *  transport controls live there, not here. */
const StickerAlbumPlayer: React.FC<StickerAlbumPlayerProps> = ({
  albumId, albumTitle, albumArtist, favoriteTrackIds,
}) => {
  const { album, index, playAlbum } = useStickerPlayer();

  const [expanded, setExpanded] = useState(false);
  const [tracks, setTracks] = useState<PlayerTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-expanding hits the promise cache, so there is no need to guard on
  // tracks already being loaded — and guarding on it would retrigger this
  // effect and cancel its own in-flight resolve.
  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadAlbumTracks(albumId)
      .then((loaded) => { if (!cancelled) { setTracks(loaded); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError('Could not load tracks'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [expanded, albumId]);

  const favourites = new Set(favoriteTrackIds ?? []);
  const playingHere = album?.id === albumId;

  return (
    <div className="sp-player">
      <button
        className="sp-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? 'Hide Track List' : 'Click to Listen'}
      </button>

      {expanded && (
        <div className="sp-panel">
          {loading && <p className="sp-status">loading tracks…</p>}
          {error && <p className="sp-status">{error}</p>}

          <ol className="sp-tracks">
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
                    <span className="sp-track-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="sp-track-title">{track.title}</span>
                    {favourites.has(track.id) && (
                      <span className="sp-track-star" title="Someone's favourite track">★</span>
                    )}
                    <span className="sp-track-dur">{formatTime(track.duration ?? 0)}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          <button
            className="sp-navidrome"
            onClick={() => window.open(`${NAVIDROME_SERVER_URL}/app/#/album/${albumId}/show`, '_blank')}
          >
            [ Open in Navidrome ]
          </button>
        </div>
      )}
    </div>
  );
};

export default StickerAlbumPlayer;
