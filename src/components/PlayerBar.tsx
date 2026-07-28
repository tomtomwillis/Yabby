import React, { useEffect, useState } from 'react';
import BlockRange, {
  SEEK_CELL_PX,
  SEEK_MIN_BLOCKS,
  VOLUME_CELL_PX,
  VOLUME_MIN_BLOCKS,
} from './basic/BlockRange';
import { formatTime, usePlayerActions, usePlayerState } from '../utils/usePlayer';
import './PlayerBar.css';

// Border glyph count. Fixed rather than width-derived — the row is decorative
// and clips under overflow: hidden, so this only has to exceed the widest panel
// the player is ever laid out in.
const BORDER_CHARS = 240;

/** The animated ASCII border. Each char is phase-shifted via --i so the row
 *  reads as a travelling wave; the keyframes only run under .pb-is-playing. */
const WaveBorder: React.FC = () => (
  <div className="pb-wave" aria-hidden="true">
    {Array.from({ length: BORDER_CHARS }, (_, i) => (
      <span key={i} className="pb-wave-ch" style={{ ['--i']: i } as React.CSSProperties}>
        =
      </span>
    ))}
  </div>
);

/** Marks radio mode at a glance. The two arcs are the broadcast, and they only
 *  pulse while the stream is actually running. */
const RadioSet: React.FC = () => (
  <pre className="pb-set" aria-hidden="true">
{`   /\\
 .----.`}<span className="pb-set-wave">{`))`}</span>{`
 |[]::|`}<span className="pb-set-wave pb-set-wave--2">{`))`}</span>{`
 '----'`}
  </pre>
);

const VolumeControl: React.FC = () => {
  const { volume, muted } = usePlayerState();
  const { setVolume, toggleMute } = usePlayerActions();
  return (
    <>
      <button
        className="pb-btn pb-mute"
        onClick={toggleMute}
        aria-pressed={muted}
        title={muted ? 'Unmute' : 'Mute'}
      >
        {muted ? 'UNMUTE' : 'VOL'}
      </button>
      <BlockRange
        label="Volume"
        className="sp-vol"
        value={muted ? 0 : volume}
        max={1}
        step={0.01}
        cellPx={VOLUME_CELL_PX}
        minBlocks={VOLUME_MIN_BLOCKS}
        onChange={setVolume}
      />
    </>
  );
};

/** Full transport: prev/play/next, seek and time. Library mode only. */
const LibraryControls: React.FC<{ onQueueToggle: () => void; queueOpen: boolean }> = ({
  onQueueToggle, queueOpen,
}) => {
  const { tracks, index, isPlaying, currentTime, duration, album } = usePlayerState();
  const { toggle, next, prev, seek } = usePlayerActions();
  const idle = index < 0;

  return (
    <>
      <div className="pb-meta">
        <span className="pb-meta-title">{tracks[index]?.title ?? '—'}</span>
        <span className="pb-meta-sub">
          {album ? `${album.title} — ${album.artist}` : 'nothing queued'}
        </span>
      </div>

      <div className="pb-row">
        <button className="pb-btn" onClick={prev} disabled={idle || index === 0} aria-label="Previous track">
          |◀
        </button>
        <button className="pb-btn pb-play" onClick={toggle} disabled={idle} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button
          className="pb-btn"
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

        <span className="pb-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <VolumeControl />

        <button
          className="pb-btn pb-queue-toggle"
          onClick={onQueueToggle}
          disabled={idle}
          aria-expanded={queueOpen}
          aria-label={queueOpen ? 'Hide track list' : 'Show track list'}
        >
          ☰
        </button>
      </div>
    </>
  );
};

/** A live stream has nowhere to seek to and nothing to skip, so it keeps only
 *  play and volume. */
const RadioControls: React.FC = () => {
  const { radio, isPlaying } = usePlayerState();
  const { toggle } = usePlayerActions();

  const nowPlaying = radio.error
    ? 'stream offline'
    : radio.title
      ? radio.artist ? `${radio.artist} · ${radio.title}` : radio.title
      : 'tuning in…';

  return (
    <>
      <div className="pb-meta pb-meta--radio">
        <RadioSet />
        <div className="pb-meta-lines">
          <span className="pb-meta-title">[ YABBYVILLE RADIO ]</span>
          <span className="pb-meta-sub">{nowPlaying}</span>
        </div>
      </div>

      <div className="pb-row">
        <button className="pb-btn pb-play" onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <VolumeControl />
      </div>
    </>
  );
};

const QueuePopup: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { album, tracks, index } = usePlayerState();
  const { playAlbum, stop } = usePlayerActions();
  if (!album) return null;

  return (
    <div className="pb-queue" role="dialog" aria-label="Album track list">
      <div className="pb-queue-head">
        <span className="pb-queue-album">{album.title} — {album.artist}</span>
        <button
          className="pb-btn"
          onClick={() => { stop(); onClose(); }}
          aria-label="Clear the queue"
        >
          clear
        </button>
        <button className="pb-btn" onClick={onClose} aria-label="Close track list">✕</button>
      </div>

      <ol className="sp-tracks">
        {tracks.map((track, i) => {
          const isCurrent = index === i;
          return (
            <li key={track.id}>
              <button
                className={isCurrent ? 'sp-track is-current' : 'sp-track'}
                aria-current={isCurrent || undefined}
                onClick={() => playAlbum(album, track.id)}
              >
                <span className="sp-track-cue" aria-hidden="true">{isCurrent ? '▶' : ' '}</span>
                <span className="sp-track-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="sp-track-title">{track.title}</span>
                <span className="sp-track-dur">{formatTime(track.duration ?? 0)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/** The one player. Library transport by default; the radio is a mode it can be
 *  switched into, and starting either source stops the other. */
const PlayerBar: React.FC = () => {
  const { mode, isPlaying } = usePlayerState();
  const { enterRadio, enterLibrary } = usePlayerActions();
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    if (!queueOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setQueueOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queueOpen]);

  // The popup belongs to the radio-mode-less library view only.
  const showQueue = queueOpen && mode === 'library';

  return (
    <div className={`pb${isPlaying ? ' pb-is-playing' : ''}${mode === 'radio' ? ' pb-radio' : ''}`}>
      {showQueue && <QueuePopup onClose={() => setQueueOpen(false)} />}

      <WaveBorder />

      <div className="pb-body">
        {mode === 'radio' ? (
          <RadioControls />
        ) : (
          <LibraryControls
            queueOpen={showQueue}
            onQueueToggle={() => setQueueOpen((v) => !v)}
          />
        )}

        <button
          className="pb-mode"
          onClick={mode === 'radio' ? enterLibrary : enterRadio}
        >
          {mode === 'radio' ? '[ ← library ]' : '[ yabbyville radio ]'}
        </button>
      </div>

      <WaveBorder />
    </div>
  );
};

export default PlayerBar;
