import React, { useEffect, useState } from 'react';
import { StickerTransport } from './StickerAlbumPlayer';
import { formatTime, useStickerPlayer } from '../utils/useStickerPlayer';
import './stickerPlayer.css';

/** Docked transport that keeps a sticker album playing after its popup closes.
 *  Mounted once in App.tsx. */
const StickerMiniBar: React.FC = () => {
  const { album, tracks, index, playAlbum, stop } = useStickerPlayer();
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    if (!queueOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setQueueOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queueOpen]);

  if (!album) return null;

  return (
    <div className="sp-dock-wrap">
      {queueOpen && (
        <div className="sp-panel sp-queue" role="dialog" aria-label="Album track list">
          <div className="sp-queue-head">
            <span className="sp-queue-album">{album.title} — {album.artist}</span>
            <button
              className="sp-dock-close"
              onClick={() => setQueueOpen(false)}
              aria-label="Close track list"
            >
              [ ✕ ]
            </button>
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
      )}

      <div className="sp-dock">
        <div className="sp-dock-meta">
          <span className="sp-dock-title">{tracks[index]?.title ?? '—'}</span>
          <span className="sp-dock-album">{album.title} — {album.artist}</span>
        </div>

        <StickerTransport />

        <button
          className="sp-dock-close"
          onClick={() => setQueueOpen((v) => !v)}
          aria-expanded={queueOpen}
          aria-label={queueOpen ? 'Hide track list' : 'Show track list'}
        >
          [ ☰ ]
        </button>

        <button className="sp-dock-close" onClick={stop} aria-label="Stop and close player">
          [ ✕ ]
        </button>
      </div>
    </div>
  );
};

export default StickerMiniBar;
