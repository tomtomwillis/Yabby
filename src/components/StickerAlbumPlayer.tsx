import React, { useEffect, useState } from 'react';
import { NAVIDROME_SERVER_URL } from '../utils/navidrome';
import {
  formatTime,
  loadAlbumTracks,
  usePlayerActions,
  usePlayerState,
  type PlayerTrack,
} from '../utils/usePlayer';
import './stickerPlayer.css';

interface StickerFavoritePlayProps {
  albumId: string;
  albumTitle: string;
  albumArtist: string;
  trackId: string;
  trackTitle?: string;
}

/** Inline ▶ beside a sticker's favourite track. A component rather than inline
 *  JSX so the subscription stays out of the sticker grid's render. */
export const StickerFavoritePlay: React.FC<StickerFavoritePlayProps> = ({
  albumId, albumTitle, albumArtist, trackId, trackTitle,
}) => {
  const { playAlbum } = usePlayerActions();
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
 *  track starts it playing in the bottom bar's player — the transport controls
 *  live there, not here. */
const StickerAlbumPlayer: React.FC<StickerAlbumPlayerProps> = ({
  albumId, albumTitle, albumArtist, favoriteTrackIds,
}) => {
  const { album, index } = usePlayerState();
  const { playAlbum } = usePlayerActions();

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
