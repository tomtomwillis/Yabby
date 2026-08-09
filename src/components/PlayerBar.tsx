import React, { useEffect, useState } from 'react';
import BlockRange, {
  SEEK_CELL_PX,
  SEEK_MIN_BLOCKS,
  VOLUME_CELL_PX,
  VOLUME_MIN_BLOCKS,
} from './basic/BlockRange';
import { NAVIDROME_SERVER_URL } from '../utils/navidrome';
import { formatTime, usePlayerActions, usePlayerState } from '../utils/usePlayer';
import './PlayerBar.css';

const albumLink = (id: string) => `${NAVIDROME_SERVER_URL}/app/#/album/${id}/show`;
const artistLink = (id: string) => `${NAVIDROME_SERVER_URL}/app/#/artist/${id}/show`;

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

/** The two ways out of the transport. Its own component so it can sit in the
 *  middle row of either mode without either having to thread the contexts. */
const PlayerLinks: React.FC = () => {
  const { mode, vizOpen } = usePlayerState();
  const { enterRadio, enterLibrary, setVizOpen } = usePlayerActions();

  return (
    <div className="pb-links">
      {/* The visualiser's box lives in the bottom bar; only its switch is here,
          beside the other thing the player can be put into. */}
      <button
        className="pb-mode pb-mode--viz"
        onClick={() => {
          if (!vizOpen) window.umami?.track('viz_open');
          setVizOpen(!vizOpen);
        }}
        aria-expanded={vizOpen}
      >
        [ viz ]
      </button>

      <button className="pb-mode" onClick={mode === 'radio' ? enterLibrary : enterRadio}>
        {mode === 'radio' ? '[ switch to player ]' : '[ switch to radio ]'}
      </button>
    </div>
  );
};

/** The metadata line and the mode links. Shared by both modes so switching one
 *  for the other cannot rearrange the top of the bar. */
const MetaRow: React.FC<{ title: React.ReactNode; sub: React.ReactNode }> = ({ title, sub }) => (
  <div className="pb-mid">
    <PlayerLinks />
    <div className="pb-meta">
      <span className="pb-meta-title">{title}</span>
      <span className="pb-meta-sub">{sub}</span>
    </div>
  </div>
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
const LibraryControls: React.FC<{
  onQueueToggle: () => void;
  queueOpen: boolean;
  trailing?: React.ReactNode;
}> = ({
  onQueueToggle, queueOpen, trailing,
}) => {
  const { tracks, index, isPlaying, currentTime, duration, album } = usePlayerState();
  const { toggle, next, prev, seek } = usePlayerActions();
  const idle = index < 0;

  return (
    <>
      <MetaRow
        title={tracks[index]?.title ?? '—'}
        sub={album ? (
          <>
            <a
              className="pb-meta-link"
              href={albumLink(album.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {album.title}
            </a>
            {' — '}
            {album.artistId ? (
              <a
                className="pb-meta-link"
                href={artistLink(album.artistId)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {album.artist}
              </a>
            ) : album.artist}
          </>
        ) : 'nothing queued'}
      />

      <div className="pb-seek">
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

        <button
          className="pb-btn pb-queue-toggle"
          onClick={onQueueToggle}
          disabled={idle}
          aria-expanded={queueOpen}
          aria-label={queueOpen ? 'Hide track list' : 'Show track list'}
        >
          ☰
        </button>

        <VolumeControl />
        {trailing}
      </div>
    </>
  );
};

/** A live stream has nowhere to seek to and nothing to skip, so it keeps only
 *  play and volume. */
const RadioControls: React.FC<{ trailing?: React.ReactNode }> = ({ trailing }) => {
  const { radio, isPlaying } = usePlayerState();
  const { toggle } = usePlayerActions();

  const nowPlaying = radio.error
    ? 'stream offline'
    : radio.title
      ? radio.artist ? `${radio.artist} · ${radio.title}` : radio.title
      : 'tuning in…';

  // Same three rows as the library, so switching mode does not rearrange the
  // bar; the set stands in for the seek bar, which a live stream has no use for.
  return (
    <>
      <MetaRow title="[ YABBY FM ]" sub={nowPlaying} />

      <div className="pb-seek pb-seek--radio">
        <RadioSet />
      </div>

      <div className="pb-row">
        <button className="pb-btn pb-play" onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <VolumeControl />
        {trailing}
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
interface PlayerBarProps {
  /** Dropped in at the end of the transport row, whichever mode is showing. */
  trailing?: React.ReactNode;
}

const PlayerBar: React.FC<PlayerBarProps> = ({ trailing }) => {
  const { mode, isPlaying } = usePlayerState();
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

      <div className="pb-body">
        {mode === 'radio' ? (
          <RadioControls trailing={trailing} />
        ) : (
          <LibraryControls
            queueOpen={showQueue}
            onQueueToggle={() => setQueueOpen((v) => !v)}
            trailing={trailing}
          />
        )}
      </div>
    </div>
  );
};

export default PlayerBar;
