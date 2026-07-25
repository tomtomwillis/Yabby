import React, { useEffect, useRef, useState } from 'react';
import { NAVIDROME_SERVER_URL } from '../utils/navidrome';
import { formatTime, useStickerPlayer } from '../utils/useStickerPlayer';
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
}

/** Entry point in the sticker popup. Starts the album playing in the persistent
 *  bottom dock (StickerMiniBar) — playback controls live there, not here. */
const StickerAlbumPlayer: React.FC<StickerAlbumPlayerProps> = ({
  albumId, albumTitle, albumArtist,
}) => {
  const { playAlbum } = useStickerPlayer();

  return (
    <div className="sp-player">
      <button
        className="sp-toggle"
        onClick={() => playAlbum({ id: albumId, title: albumTitle, artist: albumArtist })}
      >
        Click to Listen
      </button>

      <button
        className="sp-navidrome"
        onClick={() => window.open(`${NAVIDROME_SERVER_URL}/app/#/album/${albumId}/show`, '_blank')}
      >
        Open in Navidrome
      </button>
    </div>
  );
};

export default StickerAlbumPlayer;
