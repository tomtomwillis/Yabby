import React, { useEffect, useRef, useState } from "react";
import { IcecastMetadataReader } from "icecast-metadata-js";
import "./RadioPlayer.css";

const STREAM_URL = "https://radio.yabbyville.xyz";

const RadioPlayer: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [metadata, setMetadata] = useState({
    artist: "YabbyVille Radio",
    track: "",
  });
  const [volume, setVolume] = useState(0.7);
  const [isMuted, setIsMuted] = useState(false);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Metadata reader
  useEffect(() => {
    const controller = new AbortController();

    async function start() {
      const response = await fetch(STREAM_URL, {
        headers: { "Icy-MetaData": "1" },
        signal: controller.signal,
      });

      if (!response.body) return;
      const reader = response.body.getReader();

      const meta = new IcecastMetadataReader({
        metadataTypes: ["ogg"],
        onMetadata: (value: any) => {
          const title = value?.metadata?.TITLE;
          if (!title) return;

          const parts = title.split(" - ");
          setMetadata({
            artist: parts[0],
            track: parts.slice(1).join(" - "),
          });
        },
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await meta.asyncReadAll(value);
      }
    }

    start().catch(() => {});
    return () => controller.abort();
  }, []);

  // Play/pause
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true));
    }
  };

  return (
    <div className="radio-player-container">
      <audio ref={audioRef} src={STREAM_URL} />

      <div className="metadata">
        <strong>{metadata.artist}</strong>
        {metadata.track && <div>{metadata.track}</div>}
      </div>

      <div className="player-controls">
        <button className="play-button" onClick={togglePlay}>
          {isPlaying ? "Pause" : "Play"}
        </button>

        <div className="volume-control">
          <button
            className="mute-button"
            onClick={() => setIsMuted(!isMuted)}
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
            className="volume-slider"
          />
        </div>
      </div>
    </div>
  );
};

export default RadioPlayer;
