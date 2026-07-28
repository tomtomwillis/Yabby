import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { subsonicUrl } from './navidrome';
import { loadAlbumCard } from './navidromeCards';
import { useAudioEngine } from './useAudioEngine';
import { useRadioMetadata } from './useRadioMetadata';

const RADIO_STREAM_URL = 'https://radio.yabbyville.xyz/live';

export interface PlayerTrack {
  id: string;
  title: string;
  duration?: number;
}

export interface PlayerAlbum {
  id: string;
  title: string;
  artist: string;
}

/** Which source the transport is pointed at. Never both at once. */
export type PlayerMode = 'library' | 'radio';

export interface RadioNowPlaying {
  artist: string;
  title: string;
  /** The stream itself failed, so the line can say so rather than sit on
   *  "tuning in…" forever. */
  error: boolean;
}

/** mm:ss. Returns "0:00" for NaN/Infinity, which is what a still-loading stream reports. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Track list for an album. Shares navidromeCards' promise cache with the hover
 *  cards, so opening a card and then playing from it is a single getAlbum. */
export function loadAlbumTracks(albumId: string): Promise<PlayerTrack[]> {
  return loadAlbumCard(albumId).then((album) => album.tracks);
}

export interface PlayerState {
  mode: PlayerMode;

  album: PlayerAlbum | null;
  tracks: PlayerTrack[];
  index: number;
  currentTime: number;
  duration: number;
  libraryPlaying: boolean;

  radio: RadioNowPlaying;
  radioPlaying: boolean;

  /** The current mode's source. Since only one ever runs, this is also
   *  "anything is playing" — it drives the wave animation and the ASCII man. */
  isPlaying: boolean;

  volume: number;
  muted: boolean;

  vizOpen: boolean;
  vizFullscreen: boolean;
  vizReady: boolean;
}

export interface PlayerActions {
  playAlbum: (album: PlayerAlbum, startTrackId?: string) => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  /** Clears the library queue and unloads its element. Never touches the radio. */
  stop: () => void;

  /** Switches to radio mode and starts the stream in one go. */
  enterRadio: () => void;
  /** Drops the stream and returns to the album, resuming it if it was playing. */
  enterLibrary: () => void;

  toggle: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;

  setVizOpen: (open: boolean) => void;
  setVizFullscreen: (fullscreen: boolean) => void;
  registerVizHost: (el: HTMLDivElement | null) => void;
}

// Split in two: currentTime ticks about four times a second, and everything
// that only needs an action (play buttons in the sticker grid, Stats, the
// hover cards) would otherwise re-render with it.
const PlayerStateContext = createContext<PlayerState | null>(null);
const PlayerActionsContext = createContext<PlayerActions | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const libAudioRef = useRef<HTMLAudioElement | null>(null);
  const radAudioRef = useRef<HTMLAudioElement | null>(null);

  const [mode, setMode] = useState<PlayerMode>('library');
  const [album, setAlbum] = useState<PlayerAlbum | null>(null);
  const [tracks, setTracks] = useState<PlayerTrack[]>([]);
  const [index, setIndex] = useState(-1);
  const [libraryPlaying, setLibraryPlaying] = useState(false);
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [radioError, setRadioError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.7);
  const [muted, setMuted] = useState(false);

  // Latest-value mirrors, so every action can read state without becoming a
  // new function each render.
  const modeRef = useRef(mode);
  const indexRef = useRef(index);
  const tracksRef = useRef(tracks);
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);
  const anyPlayingRef = useRef(false);
  /** Was an album playing when the radio took over? */
  const resumeOnReturnRef = useRef(false);

  modeRef.current = mode;
  indexRef.current = index;
  tracksRef.current = tracks;
  volumeRef.current = volume;
  mutedRef.current = muted;
  anyPlayingRef.current = libraryPlaying || radioPlaying;

  const engine = useAudioEngine(libAudioRef, radAudioRef, anyPlayingRef);
  const {
    ensureGraph, resumeGraph, applyVolume, ensureVisualizer,
    setVizOpen, setVizFullscreen, registerVizHost,
  } = engine;

  // Only poll while the radio is on screen or still running; keep the last
  // known track when it is not, so returning does not flash "tuning in…".
  const { artist, title } = useRadioMetadata(mode === 'radio' || radioPlaying);

  useEffect(() => {
    applyVolume(volume, muted);
  }, [volume, muted, applyVolume]);

  /** Build and resume the graph, then hand it the current level — the gain node
   *  is born at 1, and the volume effect will not fire again on its own. Must
   *  run synchronously inside a user gesture. */
  const armAudio = useCallback(() => {
    const graph = ensureGraph();
    resumeGraph(graph);
    if (graph) applyVolume(volumeRef.current, mutedRef.current);
  }, [ensureGraph, resumeGraph, applyVolume]);

  // ── Source exclusivity ───────────────────────────────────

  const unloadRadio = useCallback(() => {
    const rad = radAudioRef.current;
    if (!rad || !rad.hasAttribute('src')) return;
    rad.pause();
    // A merely paused live stream keeps buffering and drifts off live, so it is
    // dropped. removeAttribute + load() is the correct abort; src = '' makes
    // the browser re-request the page URL.
    rad.removeAttribute('src');
    rad.load();
  }, []);

  const startRadio = useCallback(() => {
    const rad = radAudioRef.current;
    if (!rad) return;
    armAudio();
    libAudioRef.current?.pause();
    setRadioError(false);
    // Assigned here rather than as a JSX prop, or React would re-add it after
    // every unload and start buffering again.
    if (!rad.hasAttribute('src')) rad.src = RADIO_STREAM_URL;
    window.umami?.track('radio_play');
    // Kick the visualiser off first so its init never waits on a stalled play().
    ensureVisualizer();
    rad.play().catch((err) => {
      if (err?.name !== 'AbortError') console.error('Playback failed:', err);
    });
  }, [armAudio, ensureVisualizer]);

  // ── Library transport ────────────────────────────────────

  // Takes the queue as an argument rather than reading `tracks`, so it stays
  // correct when called in the same tick as the setTracks that loaded it.
  const start = useCallback((queue: PlayerTrack[], i: number) => {
    const audio = libAudioRef.current;
    if (!audio || !queue[i]) return;

    unloadRadio();
    setMode('library');
    setIndex(i);
    setCurrentTime(0);
    setAudioDuration(0);
    audio.src = subsonicUrl('stream', { id: queue[i].id });
    audio.play().catch((err) => {
      // Reassigning src mid-load rejects the in-flight play() with AbortError —
      // expected whenever the user picks another track before this one starts.
      if (err?.name !== 'AbortError') console.error('Playback failed:', err);
    });
  }, [unloadRadio]);

  const playAlbum = useCallback(async (nextAlbum: PlayerAlbum, startTrackId?: string) => {
    // Before the await, not after: the graph sits in the audio path now, so a
    // resume() that falls outside the user gesture means silence, not just a
    // dead visualiser.
    armAudio();
    ensureVisualizer();
    window.umami?.track('sticker_player_play', { albumId: nextAlbum.id });
    try {
      const queue = await loadAlbumTracks(nextAlbum.id);
      if (queue.length === 0) return;
      const startIndex = startTrackId ? queue.findIndex((t) => t.id === startTrackId) : 0;
      setAlbum(nextAlbum);
      setTracks(queue);
      start(queue, startIndex === -1 ? 0 : startIndex);
    } catch (err) {
      console.error('Could not load album tracks:', err);
    }
  }, [armAudio, ensureVisualizer, start]);

  const next = useCallback(() => {
    const queue = tracksRef.current;
    if (indexRef.current + 1 < queue.length) start(queue, indexRef.current + 1);
  }, [start]);

  const prev = useCallback(() => {
    if (indexRef.current > 0) start(tracksRef.current, indexRef.current - 1);
  }, [start]);

  const seek = useCallback((seconds: number) => {
    const audio = libAudioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const stop = useCallback(() => {
    const audio = libAudioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    setAlbum(null);
    setTracks([]);
    setIndex(-1);
    setLibraryPlaying(false);
    setCurrentTime(0);
    setAudioDuration(0);
  }, []);

  // ── Mode ─────────────────────────────────────────────────

  const enterRadio = useCallback(() => {
    resumeOnReturnRef.current = libAudioRef.current?.paused === false;
    setMode('radio');
    startRadio();
  }, [startRadio]);

  const enterLibrary = useCallback(() => {
    unloadRadio();
    setMode('library');
    const lib = libAudioRef.current;
    if (resumeOnReturnRef.current && lib?.hasAttribute('src')) {
      lib.play().catch(() => {});
    }
    resumeOnReturnRef.current = false;
  }, [unloadRadio]);

  const toggle = useCallback(() => {
    if (modeRef.current === 'radio') {
      const rad = radAudioRef.current;
      if (rad && !rad.paused) unloadRadio();
      else startRadio();
      return;
    }
    const lib = libAudioRef.current;
    if (!lib || !lib.hasAttribute('src')) return;
    if (lib.paused) {
      armAudio();
      lib.play().catch((err) => {
        if (err?.name !== 'AbortError') console.error('Playback failed:', err);
      });
    } else {
      lib.pause();
    }
  }, [armAudio, unloadRadio, startRadio]);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    // Dragging back up is the obvious way to undo a mute.
    if (v > 0 && mutedRef.current) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  // Subsonic's integer seconds cover the gap before metadata loads, so the
  // total never flashes 0:00; audio.duration wins once known because seek maps onto it.
  const duration = Number.isFinite(audioDuration) && audioDuration > 0
    ? audioDuration
    : tracks[index]?.duration ?? 0;

  const state: PlayerState = {
    mode,
    album,
    tracks,
    index,
    currentTime,
    duration,
    libraryPlaying,
    radio: { artist, title, error: radioError },
    radioPlaying,
    isPlaying: mode === 'radio' ? radioPlaying : libraryPlaying,
    volume,
    muted,
    vizOpen: engine.vizOpen,
    vizFullscreen: engine.vizFullscreen,
    vizReady: engine.vizReady,
  };

  // Every action reads refs, so this object is built once and never changes.
  const actions: PlayerActions = useMemo(() => ({
    playAlbum, next, prev, seek, stop,
    enterRadio, enterLibrary,
    toggle, setVolume, toggleMute,
    setVizOpen, setVizFullscreen, registerVizHost,
  }), [
    playAlbum, next, prev, seek, stop,
    enterRadio, enterLibrary,
    toggle, setVolume, toggleMute,
    setVizOpen, setVizFullscreen, registerVizHost,
  ]);

  return (
    <PlayerActionsContext.Provider value={actions}>
      <PlayerStateContext.Provider value={state}>
        {children}

        <audio
          ref={libAudioRef}
          crossOrigin="anonymous"
          preload="none"
          onPlay={() => setLibraryPlaying(true)}
          onPause={() => setLibraryPlaying(false)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration)}
          onEnded={() => {
            // 'ended' does not fire 'pause', so the flag must be cleared here.
            const queue = tracksRef.current;
            if (indexRef.current + 1 < queue.length) start(queue, indexRef.current + 1);
            else setLibraryPlaying(false);
          }}
          onError={() => {
            setLibraryPlaying(false);
            console.error('Audio stream error');
          }}
        />

        {/* No src prop — see startRadio. crossOrigin must be set before the
            resource loads or the graph would emit silence. */}
        <audio
          ref={radAudioRef}
          crossOrigin="anonymous"
          preload="none"
          onPlay={() => { setRadioPlaying(true); setRadioError(false); }}
          onPause={() => setRadioPlaying(false)}
          onError={() => {
            setRadioPlaying(false);
            // Clearing src fires error too; only a live failure counts.
            if (radAudioRef.current?.hasAttribute('src')) setRadioError(true);
          }}
        />

        {engine.fullscreenPortal}
      </PlayerStateContext.Provider>
    </PlayerActionsContext.Provider>
  );
};

export function usePlayerState(): PlayerState {
  const ctx = useContext(PlayerStateContext);
  if (!ctx) throw new Error('usePlayerState must be used inside PlayerProvider');
  return ctx;
}

export function usePlayerActions(): PlayerActions {
  const ctx = useContext(PlayerActionsContext);
  if (!ctx) throw new Error('usePlayerActions must be used inside PlayerProvider');
  return ctx;
}
