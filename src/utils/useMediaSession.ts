import { useEffect, useRef } from 'react';
import { coverArtUrl } from './navidrome';
import type { PlayerMode, PlayerAlbum, PlayerTrack } from './usePlayer';

interface MediaSessionOptions {
  mode: PlayerMode;
  album: PlayerAlbum | null;
  track: PlayerTrack | undefined;
  radioArtist: string;
  radioTitle: string;
  isPlaying: boolean;
  duration: number;
  hasNext: boolean;
  hasPrev: boolean;
  libAudioRef: React.RefObject<HTMLAudioElement | null>;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
}

const RADIO_NAME = 'Yabbyville Radio';
const ARTWORK_SIZES = [96, 192, 512];
const RADIO_ARTWORK: MediaImage[] = [
  { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
];

type Handlers = Partial<Record<MediaSessionAction, MediaSessionActionHandler | null>>;

function setHandlers(handlers: Handlers) {
  for (const [action, handler] of Object.entries(handlers)) {
    // Browsers throw on actions they do not know rather than ignoring them.
    try {
      navigator.mediaSession.setActionHandler(action as MediaSessionAction, handler ?? null);
    } catch { /* unsupported action */ }
  }
}

/** Hooks the player into the OS media controls: keyboard media keys, the
 *  lock screen and notification shade on mobile, headphone buttons. */
export function useMediaSession(opts: MediaSessionOptions): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const supported = typeof navigator !== 'undefined' && 'mediaSession' in navigator;
  const { mode, album, track, radioArtist, radioTitle, isPlaying, duration, hasNext, hasPrev } = opts;
  const active = mode === 'radio' || !!track;

  useEffect(() => {
    if (!supported) return;
    if (!active) {
      navigator.mediaSession.metadata = null;
      return;
    }
    if (mode === 'radio') {
      // Until the stream reports a track, show just the station rather than
      // a placeholder artist line.
      const known = !!radioTitle;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: known ? radioTitle : RADIO_NAME,
        artist: known ? radioArtist : '',
        album: known ? RADIO_NAME : '',
        artwork: RADIO_ARTWORK,
      });
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track?.title ?? '',
      artist: album?.artist ?? '',
      album: album?.title ?? '',
      // Several sizes so each OS takes a sharp one without pulling the original.
      artwork: album ? ARTWORK_SIZES.map((size) => ({
        src: coverArtUrl(album.id, size),
        sizes: `${size}x${size}`,
      })) : RADIO_ARTWORK,
    });
  }, [supported, active, mode, album, track, radioArtist, radioTitle]);

  useEffect(() => {
    if (!supported) return;
    navigator.mediaSession.playbackState = !active ? 'none' : isPlaying ? 'playing' : 'paused';
  }, [supported, active, isPlaying]);

  // Explicit play/pause rather than toggle alone, so a headset's "play" never
  // pauses something that is already playing.
  useEffect(() => {
    if (!supported) return;
    const isLibrary = mode === 'library';
    setHandlers({
      play: () => { if (!optsRef.current.isPlaying) optsRef.current.toggle(); },
      pause: () => { if (optsRef.current.isPlaying) optsRef.current.toggle(); },
      nexttrack: isLibrary && hasNext ? () => optsRef.current.next() : null,
      previoustrack: isLibrary && hasPrev ? () => optsRef.current.prev() : null,
      seekto: isLibrary ? (d) => { if (d.seekTime != null) optsRef.current.seek(d.seekTime); } : null,
      // Left unset on purpose: iOS swaps the track buttons for ±10s ones when
      // these exist, which is wrong for an album player.
      seekbackward: null,
      seekforward: null,
    });
  }, [supported, mode, hasNext, hasPrev]);

  useEffect(() => {
    if (!supported) return;
    return () => {
      setHandlers({
        play: null, pause: null, nexttrack: null, previoustrack: null,
        seekto: null, seekbackward: null, seekforward: null,
      });
      navigator.mediaSession.metadata = null;
    };
  }, [supported]);

  // The OS extrapolates the scrubber from the last position it was given, so
  // this only needs refreshing when playback starts, stops or jumps.
  useEffect(() => {
    const audio = opts.libAudioRef.current;
    if (!supported || !audio || !('setPositionState' in navigator.mediaSession)) return;
    const update = () => {
      try {
        if (mode === 'library' && duration > 0) {
          navigator.mediaSession.setPositionState({
            duration,
            position: Math.min(audio.currentTime, duration),
            playbackRate: audio.playbackRate,
          });
        } else {
          navigator.mediaSession.setPositionState();
        }
      } catch { /* invalid state mid-load */ }
    };
    update();
    const events = ['play', 'pause', 'seeked', 'loadedmetadata'];
    events.forEach((e) => audio.addEventListener(e, update));
    return () => events.forEach((e) => audio.removeEventListener(e, update));
  }, [supported, mode, duration, opts.libAudioRef]);
}
