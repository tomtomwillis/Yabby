import React from 'react';
import { StickerTransport } from './StickerAlbumPlayer';
import { useStickerPlayer } from '../utils/useStickerPlayer';
import './stickerPlayer.css';

/** Docked transport that keeps a sticker album playing after its popup closes.
 *  Mounted once in App.tsx. */
const StickerMiniBar: React.FC = () => {
  const { album, tracks, index, stop } = useStickerPlayer();

  if (!album) return null;

  return (
    <div className="sp-dock">
      <div className="sp-dock-meta">
        <span className="sp-dock-title">{tracks[index]?.title ?? '—'}</span>
        <span className="sp-dock-album">{album.title} — {album.artist}</span>
      </div>

      <StickerTransport />

      <button className="sp-dock-close" onClick={stop} aria-label="Stop and close player">
        [ ✕ ]
      </button>
    </div>
  );
};

export default StickerMiniBar;
