import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { subsonicUrl } from './navidrome';
import { loadAlbumCard } from './navidromeCards';

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

interface StickerPlayerValue {
  album: PlayerAlbum | null;
  tracks: PlayerTrack[];
  index: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;

  playAlbum: (album: PlayerAlbum, startTrackId?: string) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  stop: () => void;
}

const StickerPlayerContext = createContext<StickerPlayerValue | null>(null);

export const StickerPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [album, setAlbum] = useState<PlayerAlbum | null>(null);
  const [tracks, setTracks] = useState<PlayerTrack[]>([]);
  const [index, setIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [volume, setVolume] = useState(0.7);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Takes the queue as an argument rather than reading `tracks`, so it stays
  // correct when called in the same tick as the setTracks that loaded it.
  const start = useCallback((queue: PlayerTrack[], i: number) => {
    const audio = audioRef.current;
    if (!audio || !queue[i]) return;

    setIndex(i);
    setCurrentTime(0);
    setAudioDuration(0);
    audio.src = subsonicUrl('stream', { id: queue[i].id });
    audio.play().catch((err) => {
      // Reassigning src mid-load rejects the in-flight play() with AbortError —
      // expected whenever the user picks another track before this one starts.
      if (err?.name !== 'AbortError') console.error('Playback failed:', err);
    });
  }, []);

  const playAlbum = useCallback(async (nextAlbum: PlayerAlbum, startTrackId?: string) => {
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
  }, [start]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) {
      audio.play().catch((err) => {
        if (err?.name !== 'AbortError') console.error('Playback failed:', err);
      });
    } else {
      audio.pause();
    }
  }, []);

  const next = useCallback(() => {
    if (index + 1 < tracks.length) start(tracks, index + 1);
  }, [index, tracks, start]);

  const prev = useCallback(() => {
    if (index > 0) start(tracks, index - 1);
  }, [index, tracks, start]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      // removeAttribute + load() is the correct way to abort buffering;
      // src = '' makes the browser re-request the page URL.
      audio.removeAttribute('src');
      audio.load();
    }
    setAlbum(null);
    setTracks([]);
    setIndex(-1);
    setIsPlaying(false);
    setCurrentTime(0);
    setAudioDuration(0);
  }, []);

  // Subsonic's integer seconds cover the gap before metadata loads, so the
  // total never flashes 0:00; audio.duration wins once known because seek maps onto it.
  const duration = Number.isFinite(audioDuration) && audioDuration > 0
    ? audioDuration
    : tracks[index]?.duration ?? 0;

  const value: StickerPlayerValue = {
    album,
    tracks,
    index,
    isPlaying,
    currentTime,
    duration,
    volume,
    playAlbum,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    stop,
  };

  return (
    <StickerPlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setAudioDuration(e.currentTarget.duration)}
        onEnded={() => {
          // 'ended' does not fire 'pause', so isPlaying must be cleared here.
          if (index + 1 < tracks.length) start(tracks, index + 1);
          else setIsPlaying(false);
        }}
        onError={() => {
          setIsPlaying(false);
          console.error('Audio stream error');
        }}
      />
    </StickerPlayerContext.Provider>
  );
};

export function useStickerPlayer(): StickerPlayerValue {
  const ctx = useContext(StickerPlayerContext);
  if (!ctx) throw new Error('useStickerPlayer must be used inside StickerPlayerProvider');
  return ctx;
}
