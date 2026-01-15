import React, { useEffect, useRef, useState } from "react";
import "./RadioPlayer.css";

const STREAM_URL = "https://radio.yabbyville.xyz/live";
const STATUS_URL = "https://radio.yabbyville.xyz/status-json.xsl";

interface StreamMetadata {
  artist: string;
  track: string;
}

const DEFAULT_METADATA: StreamMetadata = {
  artist: "YabbyVille Radio",
  track: "",
};

const RadioPlayer: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [metadata, setMetadata] = useState<StreamMetadata>(DEFAULT_METADATA);
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);

  //
  // Sync volume + mute
  //
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  //
  // Fetch metadata via Icecast status JSON
  //
  const fetchMetadata = async () => {
    try {
      const res = await fetch(STATUS_URL, { cache: "no-store" });
      if (!res.ok) return;

      const data = await res.json();

      const source = data?.icestats?.source;
      const title =
        Array.isArray(source)
          ? source[0]?.title
          : source?.title;

      if (typeof title === "string" && title.trim() !== "") {
        setMetadata({
          artist: "YabbyVille Radio",
          track: title.trim(),
        });
      }
    } catch (err) {
      // Network or transient Icecast failure — ignore quietly
      console.debug("Metadata poll skipped:", err);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      fetchMetadata();
      pollTimerRef.current = window.setInterval(fetchMetadata, 30_000);
    } else {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isPlaying]);

  //
  // Play / Pause
  //
  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((err) => console.error("Playback failed:", err));
    }
  };

  return (
    <div className="radio-player-container">
      <audio ref={audioRef} src={STREAM_URL} preload="none" />

      <div className="metadata">
        <div className="station-left">
          <strong className="station-title">YabbyVille Radio</strong>
        </div>

        <div className="station-right">
          {metadata.track ? (
            <div className="now-playing">
              Now Playing:{" "}
              <span className="now-playing-track">
                {metadata.track}
              </span>
            </div>
          ) : (
            <div className="now-playing muted">Now Playing: —</div>
          )}
        </div>
      </div>

      <div className="player-controls">
        <button className="play-button" onClick={togglePlay}>
          {isPlaying ? "Pause" : "Play"}
        </button>

        <div className="volume-control">
          <button
            className="mute-button"
            onClick={() => setIsMuted((m) => !m)}
          >
            {isMuted ? "Unmute" : "Mute"}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              setVolume(v);
              if (v > 0 && isMuted) setIsMuted(false);
            }}
            className="volume-slider funky"
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  );
};

export default RadioPlayer;
